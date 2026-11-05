"""Build Groundwork's local market data pack from free public bulk files.

Run from projects/business-forecaster/data:
    uv run --project pipeline python pipeline/build_datapack.py --download
Writes ../src/data/datapack.json. Raw downloads go to raw/ (git-ignored).

Every number in the pack carries the release it came from, so the app can show
"Denver metro, BLS May 2025" next to it.
"""

import argparse
import io
import json
import math
import os
import zipfile
from datetime import date
from pathlib import Path

import pandas as pd
import requests

HERE = Path(__file__).resolve().parent
DATA = HERE.parent
RAW = DATA / "raw"
OUT = DATA.parent / "src" / "data" / "datapack.json"
CURATED = DATA / "curated" / "local_curated.json"
UA = {"User-Agent": os.environ.get("DATAPACK_USER_AGENT", "groundwork-forecaster datapack builder")}

DOWNLOADS = {
    "EC2272BASIC.zip": "https://www2.census.gov/programs-surveys/economic-census/data/2022/sector72/EC2272BASIC.zip",
    "cbp23msa.zip": "https://www2.census.gov/programs-surveys/cbp/datasets/2023/cbp23msa.zip",
    "oesm25ma.zip": "https://www.bls.gov/oes/special-requests/oesm25ma.zip",
    "MARPP.zip": "https://apps.bea.gov/regional/zip/MARPP.zip",
    "list1_2023.xlsx": "https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx",
    "mrtssales92-present.xlsx": "https://www.census.gov/retail/mrts/www/mrtssales92-present.xlsx",
    "cbsa-est2024-alldata.csv": "https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/metro/totals/cbsa-est2024-alldata.csv",
}

SOURCES = {
    "ec2022": {"name": "US Census Bureau, 2022 Economic Census (sector 72)", "released": "2024-11",
               "url": DOWNLOADS["EC2272BASIC.zip"]},
    "cbp2023": {"name": "US Census Bureau, County Business Patterns 2023", "released": "2025-05",
                "url": DOWNLOADS["cbp23msa.zip"]},
    "oews2025": {"name": "BLS Occupational Employment and Wage Statistics, May 2025", "released": "2026-04",
                 "url": DOWNLOADS["oesm25ma.zip"]},
    "rpp2024": {"name": "BEA Regional Price Parities by metro, 2024", "released": "2026-02",
                "url": DOWNLOADS["MARPP.zip"]},
    "mrts": {"name": "US Census Bureau, Monthly Retail Trade (NAICS 722, not seasonally adjusted)", "released": "monthly",
             "url": DOWNLOADS["mrtssales92-present.xlsx"]},
    "pop2024": {"name": "US Census Bureau, metro population estimates, July 2024", "released": "2025-03",
                "url": DOWNLOADS["cbsa-est2024-alldata.csv"]},
    "noaa": {"name": "NOAA U.S. Climate Normals 1991-2020 (monthly)", "released": "2021-05",
             "url": "https://www.ncei.noaa.gov/data/normals-monthly/1991-2020/access/"},
    "delineation": {"name": "OMB metro area delineations, July 2023", "released": "2023-07",
                    "url": DOWNLOADS["list1_2023.xlsx"]},
}

NAICS = {
    "722511": "Full-service restaurants",
    "722513": "Limited-service restaurants",
    "722515": "Snack and nonalcoholic beverage bars",
    "722410": "Drinking places (alcoholic beverages)",
    "722330": "Mobile food services",
    "722320": "Caterers",
    "812112": "Beauty salons",
}

OCCUPATIONS = {
    "35-1011": "chef", "35-1012": "supervisor", "11-9051": "manager",
    "35-2014": "cook", "35-2011": "cook_fastfood", "35-2015": "cook_shortorder", "35-2021": "prep",
    "35-3031": "server", "35-3011": "bartender", "35-9031": "host", "35-9011": "busser",
    "35-9021": "dishwasher", "35-3023": "counter", "51-3011": "baker",
    "39-5012": "stylist", "39-5092": "nail_tech", "39-5094": "esthetician", "43-4171": "receptionist",
}

# NOAA normals station per metro (principal city airport). Extend as metros are added.
STATIONS = {
    "19740": "USW00003017",  # Denver Intl
    "12420": "USW00013958",  # Austin Camp Mabry
    "38060": "USW00023183",  # Phoenix Sky Harbor
    "34980": "USW00013897",  # Nashville Intl
    "16980": "USW00094846",  # Chicago O'Hare
}


def download() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for name, url in DOWNLOADS.items():
        r = requests.get(url, headers=UA, timeout=300)
        r.raise_for_status()
        (RAW / name).write_bytes(r.content)
        print("downloaded", name, len(r.content))
    for cbsa, st in STATIONS.items():
        r = requests.get(f"{SOURCES['noaa']['url']}{st}.csv", headers=UA, timeout=60)
        r.raise_for_status()
        (RAW / f"noaa_{st}.csv").write_bytes(r.content)


def _num(x):
    try:
        v = float(x)
        return None if math.isnan(v) else v
    except (TypeError, ValueError):
        return None


def economic_census() -> tuple[dict, dict, dict]:
    """Sales per location, payroll share and staff per location by NAICS, for US, metros and counties."""
    with zipfile.ZipFile(RAW / "EC2272BASIC.zip") as z:
        raw = z.read("EC2272BASIC.dat").decode("latin-1")
    df = pd.read_csv(io.StringIO(raw), sep="|", dtype=str)
    df.columns = [c.lstrip("#") for c in df.columns]
    df = df[df["NAICS2022"].isin(NAICS)]

    def stats(r) -> dict | None:
        est, rcp, pay, emp = (_num(r[k]) for k in ("ESTAB", "RCPTOT", "PAYANN", "EMP"))
        if not est or not rcp:
            return None
        return {"estab": int(est), "salesPerEstab": round(rcp * 1000 / est),
                "payrollPct": round(pay / rcp * 100, 1) if pay else None,
                "empPerEstab": round(emp / est, 1) if emp else None,
                "payPerEmp": round(pay * 1000 / emp) if emp and pay else None}

    us, metros, counties = {}, {}, {}
    for _, r in df.iterrows():
        s = stats(r)
        if not s:
            continue
        n = r["NAICS2022"]
        if r["GEOTYPE"] == "01":
            us[n] = s
        elif r["GEOTYPE"] == "08":
            metros.setdefault(r["MSA"], {})[n] = s
        elif r["GEOTYPE"] == "03":
            counties.setdefault(r["ST"] + r["COUNTY"], {"name": r["GEO_LABEL"], "ec": {}})["ec"][n] = s
    return us, metros, counties


def county_business_patterns() -> dict:
    with zipfile.ZipFile(RAW / "cbp23msa.zip") as z:
        df = pd.read_csv(z.open("cbp23msa.txt"), dtype=str)
    df = df[df["naics"].isin(NAICS)]
    out = {}
    for _, r in df.iterrows():
        out.setdefault(r["msa"], {})[r["naics"]] = int(r["est"])
    return out


def wages() -> tuple[dict, dict]:
    with zipfile.ZipFile(RAW / "oesm25ma.zip") as z:
        name = next(n for n in z.namelist() if n.endswith("MSA_M2025_dl.xlsx"))
        df = pd.read_excel(z.open(name), usecols=["AREA", "AREA_TITLE", "OCC_CODE", "H_PCT25", "H_MEDIAN", "H_PCT75", "TOT_EMP"])
    df = df[df["OCC_CODE"].isin(OCCUPATIONS)]
    out, titles = {}, {}
    for _, r in df.iterrows():
        med = _num(r["H_MEDIAN"])
        if med is None:
            continue
        area = str(int(r["AREA"])).zfill(5)
        titles[area] = r["AREA_TITLE"]
        out.setdefault(area, {})[OCCUPATIONS[r["OCC_CODE"]]] = {
            "p25": _num(r["H_PCT25"]), "median": med, "p75": _num(r["H_PCT75"])}
    return out, titles


def price_parities() -> dict:
    with zipfile.ZipFile(RAW / "MARPP.zip") as z:
        name = next(n for n in z.namelist() if n.startswith("MARPP_MSA"))
        df = pd.read_csv(z.open(name), dtype={"GeoFIPS": str}, encoding="latin-1")
    df["GeoFIPS"] = df["GeoFIPS"].str.strip().str.strip('"')
    keep = {"RPPs: All items": "all", "RPPs: Goods": "goods", "RPPs: Services: Housing": "housing",
            "RPPs: Services: Other": "otherServices"}
    out = {}
    for _, r in df.iterrows():
        k = keep.get(str(r["Description"]).strip())
        if k and _num(r["2024"]) is not None:
            out.setdefault(r["GeoFIPS"], {})[k] = round(float(r["2024"]), 1)
    return out


def seasonality_722() -> list[float]:
    """National restaurant sales by calendar month (last two full years, not seasonally adjusted), mean = 1."""
    x = pd.ExcelFile(RAW / "mrtssales92-present.xlsx")
    rows = []
    for sheet in [s for s in x.sheet_names if s.isdigit()][1:3]:  # last two complete years
        d = pd.read_excel(x, sheet, header=None)
        hit = d[d[0].astype(str).str.strip() == "722"]
        vals = [float(v) for v in hit.iloc[0, 2:14]]  # first match = NOT ADJUSTED block
        rows.append(vals)
    avg = [sum(c) / len(c) for c in zip(*rows)]
    # Months differ in length: compare sales per day so February isn't "slow" just for being short.
    days = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    per_day = [a / dd for a, dd in zip(avg, days)]
    m = sum(per_day) / 12
    return [round(v / m, 3) for v in per_day]


def climate(station: str) -> dict | None:
    p = RAW / f"noaa_{station}.csv"
    if not p.exists():
        return None
    df = pd.read_csv(p, dtype=str)
    df.columns = [c.strip() for c in df.columns]

    def col(name):
        return [_num(v) for v in df[name]] if name in df else None

    return {"station": station, "name": df["NAME"].iloc[0].strip(),
            "tmaxF": col("MLY-TMAX-NORMAL"), "tminF": col("MLY-TMIN-NORMAL"),
            "precipDays": col("MLY-PRCP-AVGNDS-GE010HI"), "snowIn": col("MLY-SNOW-NORMAL")}


def delineation() -> tuple[dict, dict]:
    df = pd.read_excel(RAW / "list1_2023.xlsx", header=2, dtype=str).dropna(subset=["FIPS County Code"])
    county_to_cbsa, names = {}, {}
    for _, r in df.iterrows():
        fips = r["FIPS State Code"].zfill(2) + r["FIPS County Code"].zfill(3)
        county_to_cbsa[fips] = (r["CBSA Code"], f'{r["County/County Equivalent"]}, {r["State Name"]}')
        names[r["CBSA Code"]] = {"title": r["CBSA Title"], "type": r["Metropolitan/Micropolitan Statistical Area"]}
    return county_to_cbsa, names


def population() -> dict:
    df = pd.read_csv(RAW / "cbsa-est2024-alldata.csv", dtype=str, encoding="latin-1")
    df = df[df["LSAD"].str.contains("Statistical Area", na=False)]
    return {r["CBSA"]: int(r["POPESTIMATE2024"]) for _, r in df.iterrows()}


def build() -> dict:
    us_ec, metro_ec, county_ec = economic_census()
    cbp = county_business_patterns()
    wage, wage_titles = wages()
    rpp = price_parities()
    pop = population()
    county_to_cbsa, cbsa_names = delineation()
    curated = json.loads(CURATED.read_text()) if CURATED.exists() else {"states": {}, "cities": {}}
    # 50-state wage and unemployment-tax table fills states without detailed curated data.
    broad = DATA / "curated" / "states_2026.json"
    if broad.exists():
        for st, v in json.loads(broad.read_text())["states"].items():
            merged = {**v, **{k: x for k, x in curated["states"].get(st, {}).items() if x is not None}}
            merged["sources"] = curated["states"].get(st, {}).get("sources", []) + v.get("sources", [])
            curated["states"][st] = merged

    metros = {}
    for code, info in cbsa_names.items():
        if not info["type"].startswith("Metropolitan"):
            continue
        m = {"title": info["title"], "pop": pop.get(code), "rpp": rpp.get(code),
             "wages": wage.get(code), "ec": metro_ec.get(code), "cbp": cbp.get(code)}
        st = STATIONS.get(code)
        if st:
            m["climate"] = climate(st)
        metros[code] = {k: v for k, v in m.items() if v is not None}

    # Compact rows: fips -> [name, cbsa, {naics: [estab, salesPerEstab, payrollPct, empPerEstab]}]
    counties = {}
    for fips, (cbsa, name) in county_to_cbsa.items():
        ec = county_ec.get(fips, {}).get("ec", {})
        counties[fips] = [name, cbsa, {n: [s["estab"], s["salesPerEstab"], s["payrollPct"], s["empPerEstab"]] for n, s in ec.items()}]

    return {
        "meta": {"built": date.today().isoformat(), "sources": SOURCES},
        "national": {"ec": us_ec, "seasonality722": seasonality_722()},
        "metros": metros,
        "counties": counties,
        "curated": curated,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true")
    a = ap.parse_args()
    if a.download:
        download()
    pack = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(pack, separators=(",", ":")))
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB): {len(pack['metros'])} metros, {len(pack['counties'])} counties")


if __name__ == "__main__":
    main()
