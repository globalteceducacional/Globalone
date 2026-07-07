// Utilitários de validação para formulários
import { useState } from 'react';

export interface ValidationRule {
  validator: (value: any) => boolean;
  message: string;
}

export interface FieldValidation {
  isValid: boolean;
  message: string;
}

// Validações comuns
export const validators = {
  required: (value: any): boolean => {
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    if (typeof value === 'number') {
      return !isNaN(value) && value !== null && value !== undefined;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return value !== null && value !== undefined;
  },

  email: (value: string): boolean => {
    if (!value || value.trim().length === 0) return true; // Se vazio, não valida (use required para isso)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value.trim());
  },

  minLength: (min: number) => (value: string): boolean => {
    if (!value) return true; // Se vazio, não valida (use required para isso)
    return value.trim().length >= min;
  },

  maxLength: (max: number) => (value: string): boolean => {
    if (!value) return true;
    return value.trim().length <= max;
  },

  min: (min: number) => (value: number): boolean => {
    if (value === null || value === undefined || isNaN(value)) return true;
    return value >= min;
  },

  max: (max: number) => (value: number): boolean => {
    if (value === null || value === undefined || isNaN(value)) return true;
    return value <= max;
  },

  positive: (value: number): boolean => {
    if (value === null || value === undefined || isNaN(value)) return true;
    return value > 0;
  },

  date: (value: string): boolean => {
    if (!value || value.trim().length === 0) return true;
    const date = new Date(value);
    return !isNaN(date.getTime());
  },

  phone: (value: string): boolean => {
    if (!value || value.trim().length === 0) return true;
    // Remove caracteres não numéricos
    const digits = value.replace(/\D/g, '');
    // Aceita telefone com 10 ou 11 dígitos (com ou sem DDD)
    return digits.length >= 10 && digits.length <= 11;
  },
};

// Mensagens de erro padrão
export const errorMessages = {
  required: 'Este campo é obrigatório',
  email: 'Digite um e-mail válido',
  minLength: (min: number) => `Mínimo de ${min} caracteres`,
  maxLength: (max: number) => `Máximo de ${max} caracteres`,
  min: (min: number) => `Valor mínimo: ${min}`,
  max: (max: number) => `Valor máximo: ${max}`,
  positive: 'O valor deve ser maior que zero',
  date: 'Digite uma data válida',
  phone: 'Digite um telefone válido',
};

// Função para validar um campo
export function validateField(
  value: any,
  rules: ValidationRule[]
): FieldValidation {
  for (const rule of rules) {
    if (!rule.validator(value)) {
      return {
        isValid: false,
        message: rule.message,
      };
    }
  }
  return {
    isValid: true,
    message: '',
  };
}

// Hook para validação de formulário
export function useFormValidation<T extends Record<string, any>>(
  validationRules: Partial<Record<keyof T, ValidationRule[]>>
) {
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});

  const validate = (fieldName: keyof T, value: any): boolean => {
    const rules = validationRules[fieldName];
    if (!rules || rules.length === 0) {
      return true;
    }

    const validation = validateField(value, rules);
    setErrors((prev) => ({
      ...prev,
      [fieldName]: validation.isValid ? '' : validation.message,
    }));

    return validation.isValid;
  };

  const validateAll = (values: T): boolean => {
    let isValid = true;
    const newErrors: Partial<Record<keyof T, string>> = {};

    for (const fieldName in validationRules) {
      const rules = validationRules[fieldName];
      if (rules && rules.length > 0) {
        const validation = validateField(values[fieldName], rules);
        if (!validation.isValid) {
          newErrors[fieldName] = validation.message;
          isValid = false;
        }
      }
    }

    setErrors(newErrors);
    setTouched(
      Object.keys(validationRules).reduce((acc, key) => {
        acc[key as keyof T] = true;
        return acc;
      }, {} as Partial<Record<keyof T, boolean>>)
    );

    return isValid;
  };

  const handleBlur = (fieldName: keyof T) => {
    setTouched((prev) => ({
      ...prev,
      [fieldName]: true,
    }));
  };

  const handleChange = (fieldName: keyof T, value: any) => {
    if (touched[fieldName]) {
      validate(fieldName, value);
    }
  };

  const reset = () => {
    setErrors({});
    setTouched({});
  };

  const getFieldError = (fieldName: keyof T): string => {
    return errors[fieldName] || '';
  };

  const isFieldTouched = (fieldName: keyof T): boolean => {
    return touched[fieldName] || false;
  };

  const hasError = (fieldName: keyof T): boolean => {
    return !!(errors[fieldName] && touched[fieldName]);
  };

  return {
    errors,
    touched,
    validate,
    validateAll,
    handleBlur,
    handleChange,
    reset,
    getFieldError,
    isFieldTouched,
    hasError,
  };
}

