import React, { useCallback, useRef, useState } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Input,
} from '@fluentui/react-components';

// Hook that provides promise-based prompt/confirm dialogs rendered with Fluent,
// replacing the browser's native prompt()/confirm(). Usage:
//   const { askPrompt, askConfirm, dialogNode } = useDialogs();
//   const name = await askPrompt({ title, label, defaultValue });
//   if (await askConfirm({ title, message })) { ... }
// Render {dialogNode} somewhere in the component tree.
export function useDialogs() {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const settle = useCallback((value) => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setState(null);
    if (r) r(value);
  }, []);

  const askPrompt = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolverRef.current = resolve;
        setState({ kind: 'prompt', value: opts.defaultValue || '', ...opts });
      }),
    []
  );

  const askConfirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolverRef.current = resolve;
        setState({ kind: 'confirm', ...opts });
      }),
    []
  );

  const dialogNode = state ? (
    <Dialog open modalType="alert" onOpenChange={(_, d) => { if (!d.open) settle(state.kind === 'confirm' ? false : null); }}>
      <DialogSurface style={{ maxWidth: 'min(480px, 92vw)' }}>
        <DialogBody>
          <DialogTitle>{state.title}</DialogTitle>
          <DialogContent>
            {state.kind === 'prompt' ? (
              <>
                {state.label && <div style={{ marginBottom: 8, fontSize: 13 }}>{state.label}</div>}
                <form
                  id="prompt-form"
                  onSubmit={(e) => { e.preventDefault(); settle((state.value || '').trim() || null); }}
                >
                  <Input
                    autoFocus
                    value={state.value}
                    onChange={(_, d) => setState((s) => ({ ...s, value: d.value }))}
                    placeholder={state.placeholder}
                    style={{ width: '100%' }}
                  />
                </form>
              </>
            ) : (
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>{state.message}</div>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={() => settle(state.kind === 'confirm' ? false : null)}>
              {state.cancelText || 'Cancel'}
            </Button>
            {state.kind === 'prompt' ? (
              <Button appearance="primary" type="submit" form="prompt-form">
                {state.okText || 'OK'}
              </Button>
            ) : (
              <Button
                appearance="primary"
                style={state.danger ? { background: 'var(--red)', borderColor: 'var(--red)' } : undefined}
                onClick={() => settle(true)}
              >
                {state.okText || 'Confirm'}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  ) : null;

  return { askPrompt, askConfirm, dialogNode };
}
