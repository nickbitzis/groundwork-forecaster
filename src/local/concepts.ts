// Food and drink concepts. These are national planning rules of thumb (2025-2026 industry ranges),
// labeled as such in the app. Local data then moves prices, wages, rent and build-out.

import type { Daypart } from '../engine/types';

export interface ConceptMenuItem {
  name: string;
  kind: 'food' | 'drink';
  /** National typical price. Local price = this x the metro's price level. */
  price: number;
  /** Plate cost as % of price. */
  costPct: number;
  perTicket: number;
  alcohol?: 'beerWine' | 'spirits';
}

export interface Concept {
  id: string;
  name: string;
  group: 'Sit-down' | 'Counter service' | 'Bar' | 'Mobile' | 'Service';
  tagline: string;
  baseTemplate: 'full-service-restaurant' | 'coffee-shop' | 'food-truck' | 'service-shop';
  service: 'seated' | 'counter';
  /** Census industry code used for the local reality check. */
  naics: string;
  menu: ConceptMenuItem[];
  /** Square feet of dining room per seat. */
  sqftPerSeat: number;
  diningSharePct: number;
  defaultSqft: number;
  daysOpenPerWeek: number;
  dayparts: Omit<Daypart, 'id'>[];
  /** Takeout and delivery orders as a share of dine-in guests (seated) or of counter orders. */
  offPremisePct: number;
  offPremiseFeePct: number;
  /** National build-out cost per sq ft (mid-range), before the local price level. */
  buildoutPerSqft: number;
  kitchenEquipment: number;
  ffePerSeat: number;
  utilitiesPerSqftYear: number;
  insuranceMonthly: number;
  /** Staffing style. */
  seatsPerServer: number;
  coversPerCookHour: number;
  ordersPerCrewHour: number;
  hasBar: boolean;
  hasHost: boolean;
  /** Franchise costs, if any. */
  royaltyPct?: number;
  adFundPct?: number;
  franchiseFee?: number;
  ramp: { startPct: number; monthsToSteady: number };
  /** Outdoor-dependent (patio heavy or mobile): weather moves sales more. */
  weatherSensitive: boolean;
}

const dp = (name: string, start: string, end: string, p: Partial<Omit<Daypart, 'id' | 'name' | 'start' | 'end'>>): Omit<Daypart, 'id'> =>
  ({ name, start, end, turns: 0, ordersPerHour: 0, weekdayPct: 50, weekendPct: 70, ...p });

export const CONCEPTS: Concept[] = [
  {
    id: 'steakhouse', name: 'Steakhouse', group: 'Sit-down', tagline: 'Dinner, high check, strong bar',
    baseTemplate: 'full-service-restaurant', service: 'seated', naics: '722511',
    menu: [
      { name: 'Steak or main', kind: 'food', price: 52, costPct: 42, perTicket: 1 },
      { name: 'Side', kind: 'food', price: 12, costPct: 25, perTicket: 0.9 },
      { name: 'Starter or salad', kind: 'food', price: 17, costPct: 30, perTicket: 0.45 },
      { name: 'Dessert', kind: 'food', price: 13, costPct: 25, perTicket: 0.25 },
      { name: 'Wine by the glass or cocktail', kind: 'drink', price: 16, costPct: 27, perTicket: 0.9, alcohol: 'spirits' },
      { name: 'Soft drink or coffee', kind: 'drink', price: 4, costPct: 15, perTicket: 0.3 },
    ],
    sqftPerSeat: 18, diningSharePct: 60, defaultSqft: 4500, daysOpenPerWeek: 7,
    dayparts: [dp('Dinner', '16:30', '22:00', { turns: 1.15, weekdayPct: 50, weekendPct: 80 })],
    offPremisePct: 4, offPremiseFeePct: 10,
    buildoutPerSqft: 330, kitchenEquipment: 160000, ffePerSeat: 650, utilitiesPerSqftYear: 6.5, insuranceMonthly: 1800,
    seatsPerServer: 16, coversPerCookHour: 14, ordersPerCrewHour: 0, hasBar: true, hasHost: true,
    ramp: { startPct: 70, monthsToSteady: 9 }, weatherSensitive: false,
  },
  {
    id: 'casual-american', name: 'Casual American / bar and grill', group: 'Sit-down', tagline: 'Lunch and dinner, burgers to entrees, full bar',
    baseTemplate: 'full-service-restaurant', service: 'seated', naics: '722511',
    menu: [
      { name: 'Entree, burger or sandwich', kind: 'food', price: 19, costPct: 31, perTicket: 1 },
      { name: 'Starter or shared plate', kind: 'food', price: 13, costPct: 28, perTicket: 0.35 },
      { name: 'Dessert', kind: 'food', price: 9, costPct: 25, perTicket: 0.12 },
      { name: 'Beer, wine or cocktail', kind: 'drink', price: 10, costPct: 22, perTicket: 0.55, alcohol: 'spirits' },
      { name: 'Soft drink, tea or coffee', kind: 'drink', price: 3.5, costPct: 12, perTicket: 0.5 },
    ],
    sqftPerSeat: 15, diningSharePct: 60, defaultSqft: 3500, daysOpenPerWeek: 7,
    dayparts: [
      dp('Lunch', '11:00', '15:00', { turns: 0.9, weekdayPct: 40, weekendPct: 55 }),
      dp('Dinner', '16:00', '22:00', { turns: 1.3, weekdayPct: 55, weekendPct: 80 }),
    ],
    offPremisePct: 15, offPremiseFeePct: 15,
    buildoutPerSqft: 250, kitchenEquipment: 115000, ffePerSeat: 450, utilitiesPerSqftYear: 6, insuranceMonthly: 1300,
    seatsPerServer: 24, coversPerCookHour: 35, ordersPerCrewHour: 0, hasBar: true, hasHost: true,
    ramp: { startPct: 65, monthsToSteady: 8 }, weatherSensitive: false,
  },
  {
    id: 'italian', name: 'Italian / pasta and pizza, sit-down', group: 'Sit-down', tagline: 'Pasta, pizza, wine; strong dinner',
    baseTemplate: 'full-service-restaurant', service: 'seated', naics: '722511',
    menu: [
      { name: 'Pasta, pizza or main', kind: 'food', price: 23, costPct: 26, perTicket: 1 },
      { name: 'Starter or salad', kind: 'food', price: 13, costPct: 25, perTicket: 0.4 },
      { name: 'Dessert', kind: 'food', price: 10, costPct: 22, perTicket: 0.2 },
      { name: 'Wine or cocktail', kind: 'drink', price: 12, costPct: 26, perTicket: 0.55, alcohol: 'spirits' },
      { name: 'Soft drink or coffee', kind: 'drink', price: 3.5, costPct: 12, perTicket: 0.4 },
    ],
    sqftPerSeat: 15, diningSharePct: 60, defaultSqft: 3500, daysOpenPerWeek: 6,
    dayparts: [
      dp('Lunch', '11:30', '14:30', { turns: 0.8, weekdayPct: 35, weekendPct: 50 }),
      dp('Dinner', '16:30', '21:30', { turns: 1.3, weekdayPct: 55, weekendPct: 85 }),
    ],
    offPremisePct: 20, offPremiseFeePct: 15,
    buildoutPerSqft: 240, kitchenEquipment: 105000, ffePerSeat: 450, utilitiesPerSqftYear: 6, insuranceMonthly: 1200,
    seatsPerServer: 24, coversPerCookHour: 35, ordersPerCrewHour: 0, hasBar: true, hasHost: true,
    ramp: { startPct: 65, monthsToSteady: 8 }, weatherSensitive: false,
  },
  {
    id: 'mexican-sitdown', name: 'Mexican, sit-down', group: 'Sit-down', tagline: 'Plates, chips and salsa, margaritas',
    baseTemplate: 'full-service-restaurant', service: 'seated', naics: '722511',
    menu: [
      { name: 'Plate or entree', kind: 'food', price: 18, costPct: 29, perTicket: 1 },
      { name: 'Chips, guacamole or queso', kind: 'food', price: 9, costPct: 22, perTicket: 0.4 },
      { name: 'Dessert', kind: 'food', price: 7, costPct: 22, perTicket: 0.1 },
      { name: 'Margarita or beer', kind: 'drink', price: 11, costPct: 20, perTicket: 0.55, alcohol: 'spirits' },
      { name: 'Soft drink or agua fresca', kind: 'drink', price: 3.5, costPct: 12, perTicket: 0.45 },
    ],
    sqftPerSeat: 15, diningSharePct: 60, defaultSqft: 4000, daysOpenPerWeek: 7,
    dayparts: [
      dp('Lunch', '11:00', '15:00', { turns: 0.9, weekdayPct: 40, weekendPct: 60 }),
      dp('Dinner', '16:00', '22:00', { turns: 1.3, weekdayPct: 50, weekendPct: 80 }),
    ],
    offPremisePct: 18, offPremiseFeePct: 15,
    buildoutPerSqft: 230, kitchenEquipment: 100000, ffePerSeat: 400, utilitiesPerSqftYear: 6, insuranceMonthly: 1300,
    seatsPerServer: 24, coversPerCookHour: 38, ordersPerCrewHour: 0, hasBar: true, hasHost: true,
    ramp: { startPct: 65, monthsToSteady: 8 }, weatherSensitive: false,
  },
  {
    id: 'asian-sushi', name: 'Asian / sushi, sit-down', group: 'Sit-down', tagline: 'Sushi, noodles, small plates',
    baseTemplate: 'full-service-restaurant', service: 'seated', naics: '722511',
    menu: [
      { name: 'Rolls, noodles or entree', kind: 'food', price: 25, costPct: 33, perTicket: 1 },
      { name: 'Small plate or appetizer', kind: 'food', price: 11, costPct: 28, perTicket: 0.55 },
      { name: 'Sake, beer or cocktail', kind: 'drink', price: 11, costPct: 25, perTicket: 0.35, alcohol: 'spirits' },
      { name: 'Tea or soft drink', kind: 'drink', price: 3.5, costPct: 12, perTicket: 0.4 },
    ],
    sqftPerSeat: 15, diningSharePct: 58, defaultSqft: 3000, daysOpenPerWeek: 6,
    dayparts: [
      dp('Lunch', '11:30', '14:30', { turns: 0.9, weekdayPct: 40, weekendPct: 50 }),
      dp('Dinner', '17:00', '21:30', { turns: 1.25, weekdayPct: 55, weekendPct: 85 }),
    ],
    offPremisePct: 25, offPremiseFeePct: 15,
    buildoutPerSqft: 260, kitchenEquipment: 95000, ffePerSeat: 450, utilitiesPerSqftYear: 5.5, insuranceMonthly: 1100,
    seatsPerServer: 22, coversPerCookHour: 25, ordersPerCrewHour: 0, hasBar: true, hasHost: true,
    ramp: { startPct: 65, monthsToSteady: 8 }, weatherSensitive: false,
  },
  {
    id: 'fine-dining', name: 'Fine dining', group: 'Sit-down', tagline: 'Chef-driven, dinner only, wine program',
    baseTemplate: 'full-service-restaurant', service: 'seated', naics: '722511',
    menu: [
      { name: 'Main course', kind: 'food', price: 48, costPct: 33, perTicket: 1 },
      { name: 'First course', kind: 'food', price: 22, costPct: 30, perTicket: 0.8 },
      { name: 'Dessert', kind: 'food', price: 16, costPct: 25, perTicket: 0.5 },
      { name: 'Wine or cocktail', kind: 'drink', price: 18, costPct: 28, perTicket: 1.3, alcohol: 'spirits' },
    ],
    sqftPerSeat: 22, diningSharePct: 55, defaultSqft: 3800, daysOpenPerWeek: 5,
    dayparts: [dp('Dinner', '17:00', '22:00', { turns: 1.0, weekdayPct: 60, weekendPct: 90 })],
    offPremisePct: 0, offPremiseFeePct: 0,
    buildoutPerSqft: 400, kitchenEquipment: 170000, ffePerSeat: 1100, utilitiesPerSqftYear: 7, insuranceMonthly: 1600,
    seatsPerServer: 14, coversPerCookHour: 14, ordersPerCrewHour: 0, hasBar: true, hasHost: true,
    ramp: { startPct: 75, monthsToSteady: 9 }, weatherSensitive: false,
  },
  {
    id: 'brewpub-bar', name: 'Bar, brewpub or taproom with food', group: 'Bar', tagline: 'Drinks lead, food supports',
    baseTemplate: 'full-service-restaurant', service: 'seated', naics: '722410',
    menu: [
      { name: 'Beer', kind: 'drink', price: 8, costPct: 22, perTicket: 1.8, alcohol: 'beerWine' },
      { name: 'Cocktail or wine', kind: 'drink', price: 12, costPct: 20, perTicket: 0.4, alcohol: 'spirits' },
      { name: 'Food plate', kind: 'food', price: 16, costPct: 30, perTicket: 0.7 },
      { name: 'Soft drink', kind: 'drink', price: 3.5, costPct: 12, perTicket: 0.15 },
    ],
    sqftPerSeat: 14, diningSharePct: 65, defaultSqft: 3500, daysOpenPerWeek: 7,
    dayparts: [
      dp('Afternoon', '15:00', '17:00', { turns: 0.6, weekdayPct: 30, weekendPct: 55 }),
      dp('Evening', '17:00', '22:30', { turns: 1.3, weekdayPct: 45, weekendPct: 80 }),
    ],
    offPremisePct: 3, offPremiseFeePct: 10,
    buildoutPerSqft: 220, kitchenEquipment: 70000, ffePerSeat: 400, utilitiesPerSqftYear: 5.5, insuranceMonthly: 1500,
    seatsPerServer: 40, coversPerCookHour: 35, ordersPerCrewHour: 0, hasBar: true, hasHost: false,
    ramp: { startPct: 70, monthsToSteady: 8 }, weatherSensitive: true,
  },
  {
    id: 'fast-casual', name: 'Fast casual (bowls, burritos, salads)', group: 'Counter service', tagline: 'Order at the counter, lunch heavy',
    baseTemplate: 'coffee-shop', service: 'counter', naics: '722513',
    menu: [
      { name: 'Bowl, burrito or salad', kind: 'food', price: 14, costPct: 31, perTicket: 1 },
      { name: 'Side or extra', kind: 'food', price: 4, costPct: 25, perTicket: 0.3 },
      { name: 'Drink', kind: 'drink', price: 3.5, costPct: 15, perTicket: 0.5 },
    ],
    sqftPerSeat: 15, diningSharePct: 50, defaultSqft: 2400, daysOpenPerWeek: 7,
    dayparts: [
      dp('Lunch', '11:00', '14:00', { ordersPerHour: 50, weekdayPct: 70, weekendPct: 55 }),
      dp('Afternoon', '14:00', '17:00', { ordersPerHour: 20, weekdayPct: 45, weekendPct: 50 }),
      dp('Dinner', '17:00', '21:00', { ordersPerHour: 32, weekdayPct: 55, weekendPct: 60 }),
    ],
    offPremisePct: 25, offPremiseFeePct: 18,
    buildoutPerSqft: 200, kitchenEquipment: 90000, ffePerSeat: 250, utilitiesPerSqftYear: 5.5, insuranceMonthly: 700,
    seatsPerServer: 0, coversPerCookHour: 0, ordersPerCrewHour: 8, hasBar: false, hasHost: false,
    ramp: { startPct: 70, monthsToSteady: 6 }, weatherSensitive: false,
  },
  {
    id: 'burger-franchise', name: 'Burger or chicken franchise (quick service)', group: 'Counter service', tagline: 'Drive-thru, value pricing, royalties',
    baseTemplate: 'coffee-shop', service: 'counter', naics: '722513',
    menu: [
      { name: 'Combo meal', kind: 'food', price: 12, costPct: 30, perTicket: 1 },
      { name: 'Add-on or dessert', kind: 'food', price: 4, costPct: 25, perTicket: 0.25 },
      { name: 'Extra drink', kind: 'drink', price: 2.5, costPct: 12, perTicket: 0.2 },
    ],
    sqftPerSeat: 15, diningSharePct: 40, defaultSqft: 2800, daysOpenPerWeek: 7,
    dayparts: [
      dp('Lunch', '10:30', '14:00', { ordersPerHour: 65, weekdayPct: 70, weekendPct: 65 }),
      dp('Afternoon', '14:00', '17:00', { ordersPerHour: 30, weekdayPct: 50, weekendPct: 55 }),
      dp('Dinner', '17:00', '22:00', { ordersPerHour: 45, weekdayPct: 55, weekendPct: 60 }),
    ],
    offPremisePct: 15, offPremiseFeePct: 18,
    buildoutPerSqft: 260, kitchenEquipment: 160000, ffePerSeat: 250, utilitiesPerSqftYear: 7, insuranceMonthly: 800,
    seatsPerServer: 0, coversPerCookHour: 0, ordersPerCrewHour: 9, hasBar: false, hasHost: false,
    royaltyPct: 5, adFundPct: 4, franchiseFee: 45000,
    ramp: { startPct: 80, monthsToSteady: 5 }, weatherSensitive: false,
  },
  {
    id: 'pizza-takeout', name: 'Pizza, takeout and delivery', group: 'Counter service', tagline: 'Pickup and delivery heavy, small dining area',
    baseTemplate: 'coffee-shop', service: 'counter', naics: '722513',
    menu: [
      { name: 'Pizza', kind: 'food', price: 21, costPct: 26, perTicket: 1 },
      { name: 'Wings, salad or side', kind: 'food', price: 12, costPct: 30, perTicket: 0.35 },
      { name: 'Soda', kind: 'drink', price: 3, costPct: 15, perTicket: 0.4 },
    ],
    sqftPerSeat: 15, diningSharePct: 30, defaultSqft: 1800, daysOpenPerWeek: 7,
    dayparts: [
      dp('Lunch', '11:00', '14:00', { ordersPerHour: 8, weekdayPct: 55, weekendPct: 60 }),
      dp('Afternoon', '14:00', '16:30', { ordersPerHour: 5, weekdayPct: 40, weekendPct: 55 }),
      dp('Dinner', '16:30', '22:00', { ordersPerHour: 15, weekdayPct: 60, weekendPct: 90 }),
    ],
    offPremisePct: 50, offPremiseFeePct: 20,
    buildoutPerSqft: 170, kitchenEquipment: 75000, ffePerSeat: 200, utilitiesPerSqftYear: 7, insuranceMonthly: 900,
    seatsPerServer: 0, coversPerCookHour: 0, ordersPerCrewHour: 4, hasBar: false, hasHost: false,
    ramp: { startPct: 65, monthsToSteady: 8 }, weatherSensitive: false,
  },
  {
    id: 'taqueria', name: 'Taqueria or counter-service ethnic', group: 'Counter service', tagline: 'Tacos, plates, quick turns',
    baseTemplate: 'coffee-shop', service: 'counter', naics: '722513',
    menu: [
      { name: 'Tacos or plate', kind: 'food', price: 13, costPct: 30, perTicket: 1 },
      { name: 'Chips, salsa or side', kind: 'food', price: 5, costPct: 22, perTicket: 0.4 },
      { name: 'Agua fresca or soda', kind: 'drink', price: 4, costPct: 15, perTicket: 0.5 },
    ],
    sqftPerSeat: 15, diningSharePct: 50, defaultSqft: 1800, daysOpenPerWeek: 7,
    dayparts: [
      dp('Lunch', '11:00', '14:00', { ordersPerHour: 40, weekdayPct: 65, weekendPct: 70 }),
      dp('Afternoon', '14:00', '17:00', { ordersPerHour: 18, weekdayPct: 45, weekendPct: 60 }),
      dp('Dinner', '17:00', '21:00', { ordersPerHour: 30, weekdayPct: 55, weekendPct: 70 }),
    ],
    offPremisePct: 25, offPremiseFeePct: 18,
    buildoutPerSqft: 180, kitchenEquipment: 70000, ffePerSeat: 200, utilitiesPerSqftYear: 6, insuranceMonthly: 600,
    seatsPerServer: 0, coversPerCookHour: 0, ordersPerCrewHour: 9, hasBar: false, hasHost: false,
    ramp: { startPct: 65, monthsToSteady: 7 }, weatherSensitive: false,
  },
  {
    id: 'coffee', name: 'Coffee shop', group: 'Counter service', tagline: 'Espresso drinks, pastries, morning rush',
    baseTemplate: 'coffee-shop', service: 'counter', naics: '722515',
    menu: [
      { name: 'Espresso drink', kind: 'drink', price: 6, costPct: 22, perTicket: 0.85 },
      { name: 'Drip coffee or tea', kind: 'drink', price: 3.5, costPct: 18, perTicket: 0.3 },
      { name: 'Pastry or food', kind: 'food', price: 5, costPct: 38, perTicket: 0.4 },
      { name: 'Beans and merchandise', kind: 'food', price: 18, costPct: 50, perTicket: 0.02 },
    ],
    sqftPerSeat: 18, diningSharePct: 55, defaultSqft: 1600, daysOpenPerWeek: 7,
    dayparts: [
      dp('Morning', '06:30', '11:00', { ordersPerHour: 60, weekdayPct: 70, weekendPct: 75 }),
      dp('Midday', '11:00', '15:00', { ordersPerHour: 30, weekdayPct: 55, weekendPct: 65 }),
      dp('Afternoon', '15:00', '18:00', { ordersPerHour: 18, weekdayPct: 40, weekendPct: 50 }),
    ],
    offPremisePct: 12, offPremiseFeePct: 12,
    buildoutPerSqft: 170, kitchenEquipment: 55000, ffePerSeat: 250, utilitiesPerSqftYear: 5, insuranceMonthly: 400,
    seatsPerServer: 0, coversPerCookHour: 0, ordersPerCrewHour: 20, hasBar: false, hasHost: false,
    ramp: { startPct: 60, monthsToSteady: 9 }, weatherSensitive: false,
  },
  {
    id: 'bakery-cafe', name: 'Bakery cafe', group: 'Counter service', tagline: 'Baked goods, sandwiches, coffee',
    baseTemplate: 'coffee-shop', service: 'counter', naics: '722515',
    menu: [
      { name: 'Pastry or bread', kind: 'food', price: 5, costPct: 30, perTicket: 1.2 },
      { name: 'Sandwich or salad', kind: 'food', price: 13, costPct: 32, perTicket: 0.45 },
      { name: 'Coffee or tea', kind: 'drink', price: 4.5, costPct: 20, perTicket: 0.7 },
    ],
    sqftPerSeat: 18, diningSharePct: 45, defaultSqft: 2000, daysOpenPerWeek: 6,
    dayparts: [
      dp('Morning', '07:00', '11:00', { ordersPerHour: 40, weekdayPct: 65, weekendPct: 80 }),
      dp('Lunch', '11:00', '14:30', { ordersPerHour: 35, weekdayPct: 60, weekendPct: 65 }),
      dp('Afternoon', '14:30', '17:00', { ordersPerHour: 12, weekdayPct: 40, weekendPct: 45 }),
    ],
    offPremisePct: 15, offPremiseFeePct: 12,
    buildoutPerSqft: 190, kitchenEquipment: 85000, ffePerSeat: 250, utilitiesPerSqftYear: 6.5, insuranceMonthly: 550,
    seatsPerServer: 0, coversPerCookHour: 0, ordersPerCrewHour: 15, hasBar: false, hasHost: false,
    ramp: { startPct: 60, monthsToSteady: 9 }, weatherSensitive: false,
  },
  {
    id: 'food-truck', name: 'Food truck', group: 'Mobile', tagline: 'Lunch spots, breweries, events',
    baseTemplate: 'food-truck', service: 'counter', naics: '722330',
    menu: [
      { name: 'Main item', kind: 'food', price: 14, costPct: 31, perTicket: 1 },
      { name: 'Side', kind: 'food', price: 5, costPct: 25, perTicket: 0.4 },
      { name: 'Drink', kind: 'drink', price: 3, costPct: 20, perTicket: 0.5 },
    ],
    sqftPerSeat: 0, diningSharePct: 0, defaultSqft: 0, daysOpenPerWeek: 5,
    dayparts: [
      dp('Lunch stop', '11:00', '14:00', { ordersPerHour: 30, weekdayPct: 55, weekendPct: 50 }),
      dp('Evening stop', '17:00', '21:00', { ordersPerHour: 25, weekdayPct: 40, weekendPct: 70 }),
    ],
    offPremisePct: 0, offPremiseFeePct: 0,
    buildoutPerSqft: 0, kitchenEquipment: 132000, ffePerSeat: 0, utilitiesPerSqftYear: 0, insuranceMonthly: 450,
    seatsPerServer: 0, coversPerCookHour: 0, ordersPerCrewHour: 20, hasBar: false, hasHost: false,
    ramp: { startPct: 55, monthsToSteady: 6 }, weatherSensitive: true,
  },
];

export function getConcept(id: string): Concept {
  return CONCEPTS.find((c) => c.id === id) ?? CONCEPTS[1];
}
