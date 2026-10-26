import type { PageMeta } from '../../../domain/sharePage';
import type { JsonValidator } from '../../../data/validatedJson';
declare const validate: JsonValidator<Record<string, PageMeta>>;
export { validate };
export default validate;
