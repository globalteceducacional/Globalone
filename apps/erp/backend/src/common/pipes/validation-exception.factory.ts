import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { flattenValidationErrors } from '../utils/user-facing-error.util';

export function validationExceptionFactory(errors: ValidationError[]) {
  const messages = flattenValidationErrors(errors);
  return new BadRequestException(messages.length > 0 ? messages : ['Verifique os campos do formulário.']);
}
