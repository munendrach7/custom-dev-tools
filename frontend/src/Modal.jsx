import React from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  Button,
} from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';

// Thin wrapper over Fluent's Dialog so existing call sites (title/onClose/
// children/footer) keep working while rendering a themed Fluent surface.
export default function Modal({ title, onClose, children, footer, wide }) {
  return (
    <Dialog
      open
      modalType="non-modal"
      onOpenChange={(_, data) => {
        if (!data.open) onClose();
      }}
    >
      <DialogSurface
        className="fluent-dialog-surface"
        style={{ maxWidth: wide ? 'min(1100px, 94vw)' : 'min(680px, 92vw)' }}
      >
        <DialogBody>
          <DialogTitle
            action={
              <Button
                appearance="subtle"
                aria-label="Close"
                icon={<Dismiss24Regular />}
                onClick={onClose}
              />
            }
          >
            {title}
          </DialogTitle>
          <DialogContent>{children}</DialogContent>
          {footer}
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
