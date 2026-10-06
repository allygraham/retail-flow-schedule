import { createContext, useContext, useId } from 'react';

export const FieldContext = createContext<{ labelId?: string; controlId?: string; descriptionId?: string; invalid: boolean } | null>(null);

/** Each control has a unique ID, including grouped controls inside a field. */
export function useFieldControl(id?: string, describedBy?: string) {
  const generated = useId();
  const field = useContext(FieldContext);
  return {
    id: id ?? field?.controlId ?? generated,
    'aria-labelledby': field?.labelId,
    'aria-describedby': [...new Set([describedBy, field?.descriptionId].filter(Boolean))].join(' ') || undefined,
    'aria-invalid': field?.invalid || undefined,
  };
}
