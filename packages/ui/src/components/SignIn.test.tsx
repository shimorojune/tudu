import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TICK_PATH } from '../lib/ink';
import { parseRules, readStylesheet, rulesWhere } from '../test-utils/stylesheet';
import { AUTH_LEAVE_MS } from './AuthLayer';
import { DONE_DELAY_MS, SignIn, SignInError, countdown, type SignInProps } from './SignIn';
import { dismissToast, ToastHost } from './Toast';

const rules = parseRules(readStylesheet('components.css'));
const EMAIL = 'rohit@northwind.app';
const CODE = 'The 6-digit code';
const WRONG = 'That code didn’t work. Check the email, or send a new one.';
const EXPIRED = 'That code has expired. Send a new one; it takes a few seconds.';
const LOCKED = 'Too many tries. Send a new code and use that one.';

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
}
function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('SignIn, the email step', () => {
  it('C01-U03 validates on Continue or Enter, not while typing; "not an email" shows in red under the field; a good address sends the code', async () => {
    const user = userEvent.setup();
    const sent = deferred();
    const sendCode = vi.fn(() => sent.promise);
    const { container } = render(
      <SignIn
        open
        inline
        initial={{ noFocus: true }}
        sendCode={sendCode}
        verifyCode={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    expect(screen.getByRole('main', { name: 'Sign in' })).toHaveClass('tp-auth-inline');
    expect(screen.getByRole('heading', { name: 'Sign in to Tudu' })).toBeInTheDocument();
    expect(container.querySelector('.tp-auth-art')).toBeNull(); // inline: the form alone
    const input = screen.getByRole('textbox', { name: 'Email' });
    const go = screen.getByRole('button', { name: 'Continue' });
    const help = () => container.querySelector('.tp-auth-page > .tp-help');

    await user.type(input, 'rohit@northwind');
    expect(help()).toBeNull();
    expect(input.closest('.tp-field')).not.toHaveClass('tp-bad');

    await user.click(go);
    expect(help()).toHaveTextContent('That doesn’t look like an email address.');
    expect(help()).toHaveAttribute('role', 'alert');
    expect(input.closest('.tp-field')).toHaveClass('tp-bad');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', help()!.id);
    expect(sendCode).not.toHaveBeenCalled();
    expect(go).toHaveTextContent('Continue'); // stays where it is
    expect(go).toHaveAttribute('data-mode', 'idle');
    const red = rulesWhere(rules, (s) => s === '.tp-help')[0];
    expect(red?.declarations.color).toBe('var(--destructive)');

    const end = (input as HTMLInputElement).value.length;
    await user.type(input, '.app', { initialSelectionStart: end, initialSelectionEnd: end });
    expect(input).toHaveValue(EMAIL);
    expect(help()).toBeNull(); // typing clears the line; it does not judge
    expect(sendCode).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(sendCode).toHaveBeenCalledTimes(1);
    expect(sendCode).toHaveBeenCalledWith(EMAIL);
    expect(go).toHaveTextContent('Sending a code…');
    expect(go).toHaveAttribute('data-mode', 'busy');

    await act(async () => sent.resolve());
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(container.querySelector('.tp-auth-lead b')).toHaveTextContent(EMAIL);
    expect(container.querySelector('.tp-auth-stage')).toHaveClass('tp-auth-next');
    expect(screen.getByRole('textbox', { name: CODE })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: CODE })).toHaveValue('');

    // The footer and its links stay on both steps.
    const foot = container.querySelector('.tp-auth-foot') as HTMLElement;
    expect(foot).toHaveTextContent('By continuing you agree to Tudu’s Terms and Privacy.');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '#');
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '#');
  });

  it('C01-U03 a failed send says why under the field and Continue comes back', async () => {
    const user = userEvent.setup();
    const sent = deferred();
    const sendCode = vi.fn(() => sent.promise);
    const { container } = render(
      <SignIn
        open
        inline
        initial={{ email: EMAIL, noFocus: true }}
        sendCode={sendCode}
        verifyCode={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    const go = screen.getByRole('button', { name: 'Continue' });
    await user.click(go);
    expect(go).toHaveTextContent('Sending a code…');
    await act(async () => sent.reject(new Error('The code could not be sent. Try again in a moment.')));
    expect(container.querySelector('.tp-auth-page > .tp-help')).toHaveTextContent(
      'The code could not be sent. Try again in a moment.',
    );
    expect(go).toHaveTextContent('Continue');
    expect(go).toHaveAttribute('data-mode', 'idle');
    expect(screen.getByRole('heading', { name: 'Sign in to Tudu' })).toBeInTheDocument();
  });
});

describe('SignIn, the states', () => {
  beforeEach(() => {
    dismissToast();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function tick(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  /** The code step, in place, with the address already given. */
  function codeStep(extra: Partial<SignInProps> = {}) {
    const checked = deferred();
    const verifyCode = vi.fn(() => checked.promise);
    const sendCode = vi.fn(() => Promise.resolve());
    const onDone = vi.fn();
    const utils = render(
      <SignIn
        open
        inline
        step="code"
        initial={{ email: EMAIL, noFocus: true }}
        sendCode={sendCode}
        verifyCode={verifyCode}
        onDone={onDone}
        {...extra}
      />,
    );
    const input = () => screen.getByRole('textbox', { name: CODE });
    const status = () => utils.container.querySelector('.tp-auth-status') as HTMLElement;
    const help = () => utils.container.querySelector('.tp-code .tp-help');
    const resend = () => screen.getByRole('button', { name: /^Send a new code/ });
    const enter = (code: string) => fireEvent.change(input(), { target: { value: code } });
    return { ...utils, checked, verifyCode, sendCode, onDone, input, status, help, resend, enter };
  }

  it('C01-U04 sending: Continue spins with "Sending a code…" while the code goes out, then the code step slides in', async () => {
    const sent = deferred();
    const sendCode = vi.fn(() => sent.promise);
    const { container } = render(
      <SignIn
        open
        inline
        initial={{ email: EMAIL, noFocus: true }}
        sendCode={sendCode}
        verifyCode={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    const go = screen.getByRole('button', { name: 'Continue' });
    fireEvent.click(go);
    expect(sendCode).toHaveBeenCalledWith(EMAIL);
    expect(go).toHaveTextContent('Sending a code…');
    expect(go).toHaveAttribute('data-mode', 'busy');
    expect(go.querySelector('.tp-spin')).not.toBeNull();
    fireEvent.click(go); // a second press while sending does nothing
    expect(sendCode).toHaveBeenCalledTimes(1);

    await act(async () => sent.resolve());
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(container.querySelector('.tp-auth-stage')).toHaveClass('tp-auth-next');
    const slide = rulesWhere(rules, (s) => s === '.tp-auth-next')[0];
    expect(slide?.declarations.animation).toContain('tp-cs-next 300ms');
    expect(screen.getByRole('button', { name: 'Send a new code in 0:30' })).toBeDisabled();
  });

  it('C01-U04 checking: six digits check themselves; "Checking…" with the spinner while the boxes rest', () => {
    const { verifyCode, input, status, enter, container } = codeStep();
    expect(status()).toBeEmptyDOMElement();
    enter('482913');
    expect(verifyCode).toHaveBeenCalledTimes(1);
    expect(verifyCode).toHaveBeenCalledWith(EMAIL, '482913');
    expect(status()).toHaveTextContent('Checking…');
    expect(status().querySelector('.tp-spin')).not.toBeNull();
    expect(status()).not.toHaveClass('tp-ok');
    expect(input()).toBeDisabled();
    expect(container.querySelector('.tp-code')).toHaveClass('tp-off');
    expect(container.querySelectorAll('.tp-code-b.tp-has')).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Use a different email' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send a new code in 0:30' })).toBeDisabled();
  });

  it('C01-U04 you’re in: the ink tick and "You’re in.", onDone 500ms later; the desktop layer then fades out over 320ms', async () => {
    const checked = deferred();
    const verifyCode = vi.fn(() => checked.promise);
    const onDone = vi.fn();
    const props: SignInProps = {
      open: true,
      step: 'code',
      initial: { email: EMAIL, noFocus: true },
      sendCode: vi.fn(),
      verifyCode,
      onDone,
    };
    const { container, rerender } = render(<SignIn {...props} />);
    const layer = screen.getByRole('main', { name: 'Sign in' });
    expect(layer).toHaveClass('tp-auth-split'); // desktop: the form beside the picture of the day
    expect(container.querySelector('.tp-auth-art')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.change(screen.getByRole('textbox', { name: CODE }), { target: { value: '482913' } });
    await act(async () => checked.resolve());
    const status = container.querySelector('.tp-auth-status') as HTMLElement;
    expect(status).toHaveTextContent('You’re in.');
    expect(status).toHaveClass('tp-ok');
    expect(status.querySelector('.tp-auth-tick svg path')).toHaveAttribute('d', TICK_PATH);
    expect(status.querySelector('.tp-spin')).toBeNull();
    const tick = rulesWhere(rules, (s) => s === '.tp-auth-tick')[0];
    expect(tick?.declarations.animation).toContain('tp-pop-in 200ms');
    expect(screen.getByRole('textbox', { name: CODE })).toBeDisabled();

    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(DONE_DELAY_MS - 1);
    });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith({ email: EMAIL });

    // The app closes it: the layer fades (and grows a hair) over 320ms, then goes.
    rerender(<SignIn {...props} open={false} />);
    expect(layer).toHaveClass('tp-leaving');
    const out = rulesWhere(rules, (s) => s === '.tp-auth.tp-leaving')[0];
    expect(out?.declarations.animation).toContain('tp-auth-out 320ms');
    expect(out?.declarations['pointer-events']).toBe('none');
    act(() => {
      vi.advanceTimersByTime(AUTH_LEAVE_MS - 1);
    });
    expect(screen.queryByRole('main')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('main')).toBeNull();
  });

  it('C01-U04 expired: says so, and Send a new code is ready at once', async () => {
    const { checked, input, status, help, resend, enter, container } = codeStep();
    expect(resend()).toBeDisabled();
    enter('482913');
    await act(async () => checked.reject(new SignInError('expired', EXPIRED)));
    expect(help()).toHaveTextContent(EXPIRED);
    expect(container.querySelector('.tp-code')).toHaveClass('tp-bad');
    expect(resend()).toHaveTextContent('Send a new code');
    expect(resend()).toBeEnabled();
    expect(input()).toBeEnabled();
    expect(status()).toBeEmptyDOMElement();
  });

  it('C01-U04 too many tries: says so and the boxes rest until a new code is sent; the new code resets the field and toasts', async () => {
    const sent = deferred();
    const sendCode = vi.fn(() => sent.promise);
    const { checked, input, help, resend, enter, container } = codeStep({ sendCode });
    render(<ToastHost />);
    enter('482913');
    await act(async () => checked.reject(new SignInError('locked', LOCKED)));
    expect(help()).toHaveTextContent(LOCKED);
    expect(input()).toBeDisabled();
    expect(container.querySelector('.tp-code')).toHaveClass('tp-off');
    // the boxes empty, as on the states board, and rest until a new code is sent
    expect(container.querySelectorAll('.tp-code-b.tp-has')).toHaveLength(0);
    expect(resend()).toBeEnabled();

    fireEvent.click(resend());
    expect(sendCode).toHaveBeenCalledTimes(1);
    expect(sendCode).toHaveBeenCalledWith(EMAIL);
    expect(input()).toBeEnabled();
    expect(input()).toHaveValue('');
    expect(container.querySelectorAll('.tp-code-b.tp-has')).toHaveLength(0);
    expect(help()).toBeNull();
    expect(resend()).toHaveTextContent('Send a new code in 0:30');
    expect(resend()).toBeDisabled();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    await act(async () => sent.resolve());
    expect(screen.getByRole('status')).toHaveTextContent(`A new code is on its way to ${EMAIL}.`);
  });

  it('C01-U04 wrong: says so, the boxes empty with the nudge and take the next try; any other error just says its line', async () => {
    const { checked, verifyCode, input, help, enter, container } = codeStep();
    const before = container.querySelector('.tp-code-row');
    enter('482913');
    await act(async () => checked.reject(new SignInError('wrong', WRONG)));
    expect(help()).toHaveTextContent(WRONG);
    expect(container.querySelector('.tp-code')).toHaveClass('tp-bad');
    expect(input()).toHaveValue('');
    expect(container.querySelectorAll('.tp-code-b.tp-has')).toHaveLength(0);
    expect(container.querySelector('.tp-code-row')).not.toBe(before); // re-mounted: the nudge plays
    expect(input()).toBeEnabled();
    expect(input()).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Send a new code in 0:30' })).toBeDisabled();

    // Typing again clears the line and keeps the field.
    const row = container.querySelector('.tp-code-row');
    enter('4');
    expect(help()).toBeNull();
    expect(container.querySelector('.tp-code')).not.toHaveClass('tp-bad');
    expect(container.querySelector('.tp-code-row')).toBe(row);

    verifyCode.mockImplementationOnce(() =>
      Promise.reject(new Error('Tudu is away for a moment. Try again.')),
    );
    enter('482913');
    expect(verifyCode).toHaveBeenCalledTimes(2);
    await act(async () => {});
    expect(help()).toHaveTextContent('Tudu is away for a moment. Try again.');
    expect(input()).toHaveValue('482913'); // kept: it may well be right
    expect(input()).toBeEnabled();
  });

  it('C01-U04 Send a new code counts down from 0:30 one second at a time, then is ready', () => {
    const { resend } = codeStep();
    expect(resend()).toHaveTextContent('Send a new code in 0:30');
    expect(resend()).toBeDisabled();
    tick(999);
    expect(resend()).toHaveTextContent('Send a new code in 0:30');
    tick(1);
    expect(resend()).toHaveTextContent('Send a new code in 0:29');
    // Each second's timer is set once the last one has rendered, so the clock moves a second at a time.
    for (let s = 0; s < 28; s++) tick(1000);
    expect(resend()).toHaveTextContent('Send a new code in 0:01');
    expect(resend()).toBeDisabled();
    tick(1000);
    expect(resend()).toHaveTextContent('Send a new code');
    expect(resend()).toBeEnabled();
    // The count is tabular, so the digits do not jitter.
    const off = rulesWhere(rules, (s) => s === '.tp-root .tp-auth-link[disabled]')[0];
    expect(off?.declarations['font-variant-numeric']).toBe('tabular-nums');
    expect(countdown(75)).toBe('1:15');
    expect(countdown(0)).toBe('0:00');
  });

  it('C01-U04 Use a different email slides back to the email step with the address kept', () => {
    const { container } = codeStep({ resendSeconds: 45 });
    expect(screen.getByRole('button', { name: 'Send a new code in 0:45' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(screen.getByRole('heading', { name: 'Sign in to Tudu' })).toBeInTheDocument();
    expect(container.querySelector('.tp-auth-stage')).toHaveClass('tp-auth-prev');
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue(EMAIL);
  });

  it('C01-U04 the boards: initial draws each state in place; the picture of the day takes its words from art', () => {
    const noop = vi.fn();
    const handlers = { sendCode: noop, verifyCode: noop, onDone: noop };
    const checking = render(
      <SignIn
        open
        inline
        step="code"
        initial={{ email: EMAIL, code: '482913', busy: 1, noFocus: true }}
        {...handlers}
      />,
    );
    expect(checking.container.querySelector('.tp-auth-status')).toHaveTextContent('Checking…');
    expect(checking.container.querySelectorAll('.tp-code-b.tp-has')).toHaveLength(6);
    expect(screen.getByRole('textbox', { name: CODE })).toBeDisabled();
    checking.unmount();

    const done = render(
      <SignIn
        open
        inline
        step="code"
        initial={{ email: EMAIL, code: '482913', busy: 2, noFocus: true }}
        {...handlers}
      />,
    );
    expect(done.container.querySelector('.tp-auth-status')).toHaveTextContent('You’re in.');
    expect(done.container.querySelector('.tp-auth-status')).toHaveClass('tp-ok');
    tick(DONE_DELAY_MS);
    expect(noop).not.toHaveBeenCalled(); // a board, not a sign in: nothing fires
    done.unmount();

    const locked = render(
      <SignIn
        open
        inline
        step="code"
        initial={{ email: EMAIL, error: LOCKED, wait: 0, locked: true, noFocus: true }}
        {...handlers}
      />,
    );
    expect(locked.container.querySelector('.tp-code .tp-help')).toHaveTextContent(LOCKED);
    expect(screen.getByRole('textbox', { name: CODE })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeEnabled();
    locked.unmount();

    const phone = render(<SignIn open phone initial={{ email: EMAIL, noFocus: true }} {...handlers} />);
    expect(screen.getByRole('main', { name: 'Sign in' })).toHaveClass('tp-auth-phone');
    expect(screen.getByRole('main', { name: 'Sign in' })).not.toHaveClass('tp-auth-split');
    expect(phone.container.querySelector('.tp-auth-art')).toBeNull();
    phone.unmount();

    const desktop = render(<SignIn open initial={{ noFocus: true }} {...handlers} />);
    const art = desktop.container.querySelector('.tp-auth-art') as HTMLElement;
    expect(art.querySelector('.tp-auth-eye')).toHaveTextContent('Today · Week 43');
    expect(art.querySelector('.tp-auth-day span')).toHaveTextContent('Tuesday');
    expect(art.querySelector('.tp-auth-day em')).toHaveTextContent('20 October');
    expect(art.querySelector('.tp-auth-cap')).toHaveTextContent('One calm page for your day.');
    expect(art.querySelectorAll('.tp-auth-row')).toHaveLength(4);
    expect(art.querySelectorAll('.tp-auth-row.tp-done')).toHaveLength(1);
    desktop.rerender(
      <SignIn
        open
        initial={{ noFocus: true }}
        art={{ day: 'Monday', date: '19 October', week: 43 }}
        {...handlers}
      />,
    );
    expect(art.querySelector('.tp-auth-day span')).toHaveTextContent('Monday');
    expect(art.querySelector('.tp-auth-day em')).toHaveTextContent('19 October');
  });
});
