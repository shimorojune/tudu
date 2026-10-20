import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { useFieldId } from '../lib/hooks';
import { Icon } from '../lib/icons';

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> {
  /** The accessible name. */
  label: string;
  /** A 16px icon before the text. */
  icon?: ReactNode;
  /** A short message under the field, in red, with an icon. Red here only ever means an error. */
  error?: string;
}

/**
 * A 38px text input on an accent fill. Hover shows a border edge; focus turns it to card with an ink edge and a
 * soft accent halo. Long values end in an ellipsis. With an error the same states stay alive in red.
 */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, icon, error, id, className, type = 'text', ...rest },
  ref,
) {
  const fieldId = useFieldId(id, label);
  const errorId = `${fieldId}-err`;
  return (
    <div className={cx('tp-root', className)}>
      <label className={cx('tp-field', error && 'tp-bad')} htmlFor={fieldId}>
        {icon ?? null}
        <input
          ref={ref}
          id={fieldId}
          type={type}
          aria-label={label}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          {...rest}
        />
      </label>
      {error ? (
        <div className="tp-help" id={errorId} role="alert">
          <Icon name="error" size={13} stroke={2.2} />
          {error}
        </div>
      ) : null}
    </div>
  );
});
