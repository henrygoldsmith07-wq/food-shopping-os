/**
 * The recipe book's templates, assembled.
 *
 * Split by meal because the file outgrew the project's 500-line limit, and
 * because "every breakfast we can make" is a more useful thing to open than
 * "every dish". The generator only ever wants the whole list.
 */

import { BREAKFAST_TEMPLATES } from './templates-breakfast.js';
import { LUNCH_TEMPLATES } from './templates-lunch.js';
import { DINNER_TEMPLATES } from './templates-dinner.js';

export { BREAKFAST_TEMPLATES, LUNCH_TEMPLATES, DINNER_TEMPLATES };

export const TEMPLATES = [...BREAKFAST_TEMPLATES, ...LUNCH_TEMPLATES, ...DINNER_TEMPLATES];
