import type { Assumptions } from '../types';
import type { BusinessTemplate } from './common';
import { coffeeShop } from './coffeeShop';
import { foodTruck } from './foodTruck';
import { fullServiceRestaurant } from './fullServiceRestaurant';
import { serviceShop } from './serviceShop';

export type { BusinessTemplate } from './common';

/** Add a new business type by writing one data file and listing it here. */
export const TEMPLATES: BusinessTemplate[] = [fullServiceRestaurant, foodTruck, coffeeShop, serviceShop];

export function getTemplate(id: string): BusinessTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? fullServiceRestaurant;
}

/** A fresh, independent copy of a template's defaults. */
export function newPlan(templateId: string, overrides: Partial<Pick<Assumptions, 'businessName' | 'openingMonth'>> = {}): Assumptions {
  const a = structuredClone(getTemplate(templateId).defaults);
  return { ...a, ...overrides };
}
