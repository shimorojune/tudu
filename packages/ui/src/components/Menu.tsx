import { DropdownMenu } from 'radix-ui';
import type { ReactElement, ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface MenuItem {
  label: ReactNode;
  /** Short mono text such as a date. */
  hint?: ReactNode;
  onSelect?: () => void;
  /** Delete task, Delete comment: red text, a destructive-soft hover. Still never a red fill. */
  danger?: boolean;
  disabled?: boolean;
}

export interface MenuProps {
  /** The control that opens it. */
  children: ReactElement;
  /** Names the menu for screen readers. */
  label: string;
  heading?: string;
  /** Falsy entries are skipped, so items can be conditional. */
  items: Array<MenuItem | false | null | undefined>;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/**
 * A popover list of choices on the popover surface, radius-lg, shadow-pop; items 36px. Opens in dur-menu from
 * scale .96 and flips upward when there is no room below. Arrow keys move, Enter picks, Esc closes.
 */
export function Menu({
  children,
  label,
  heading,
  items,
  side = 'bottom',
  align = 'end',
  open,
  onOpenChange,
  className,
}: MenuProps) {
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={cx('tp-root tp-menu tp-menu-pop', className)}
          aria-label={label}
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          loop
        >
          {heading ? <DropdownMenu.Label className="tp-mh">{heading}</DropdownMenu.Label> : null}
          {items
            .filter((it): it is MenuItem => !!it)
            .map((it, i) => (
              <DropdownMenu.Item
                key={i}
                className={cx('tp-mi', it.danger && 'tp-mi-danger')}
                disabled={it.disabled}
                onSelect={() => it.onSelect?.()}
              >
                {it.label}
                {it.hint ? <span>{it.hint}</span> : null}
              </DropdownMenu.Item>
            ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** The bare list, for a menu drawn in place by something that positions it itself. */
export function MenuList({
  heading,
  items,
  label,
  className,
}: Pick<MenuProps, 'heading' | 'items' | 'label' | 'className'>) {
  return (
    <div className={cx('tp-root tp-menu', className)} role="menu" aria-label={label}>
      {heading ? <div className="tp-mh">{heading}</div> : null}
      {items
        .filter((it): it is MenuItem => !!it)
        .map((it, i) => (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={cx('tp-mi', it.danger && 'tp-mi-danger')}
            disabled={it.disabled}
            onClick={it.onSelect}
          >
            {it.label}
            {it.hint ? <span>{it.hint}</span> : null}
          </button>
        ))}
    </div>
  );
}
