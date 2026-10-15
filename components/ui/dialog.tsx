'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { keepOpenForToasts } from '@/lib/inside-toast'
import { Button } from '@/components/ui/button'

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50',
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onInteractOutside,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg',
          className,
        )}
        {...props}
        onInteractOutside={keepOpenForToasts(onInteractOutside)}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-muted data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

/**
 * A Radix dialog that keeps a hand-built overlay's own look: the backdrop
 * (`overlayClassName`) doubles as the flex container that places the panel
 * (`className`), so a sheet that was `fixed inset-0 flex items-end …` around
 * a panel keeps exactly those classes. Radix supplies Escape, the focus trap,
 * focus return, scroll lock and portal-order stacking — a ConfirmDialog
 * opened from inside one portals later and so sits on top of it.
 *
 * Name it by rendering the visible heading as `<DialogTitle className=…>`
 * with the heading's own classes, or pass `title` for a visually hidden name
 * when the design has none. Set `described` when the panel renders a
 * `<DialogDescription>`. A tap on a toast never dismisses it (lib/inside-toast).
 */
function DialogLayer({
  open,
  onOpenChange,
  title,
  described = false,
  overlayClassName,
  className,
  children,
  onInteractOutside,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Content>, 'title'> & {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  described?: boolean
  overlayClassName?: string
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="dialog-overlay"
          className={cn('fixed inset-0 z-50', overlayClassName)}
        >
          <DialogPrimitive.Content
            data-slot="dialog-content"
            // Most of these overlays have no separate description; an explicit
            // undefined tells Radix that is deliberate (and silences its warning).
            {...(described ? {} : { 'aria-describedby': undefined })}
            className={cn('outline-none', className)}
            {...props}
            onInteractOutside={keepOpenForToasts(onInteractOutside)}
          >
            {title && <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>}
            {children}
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * The titled panel every record screen uses (formerly shared/ui's Modal),
 * built on DialogLayer: a bottom sheet on a phone, a centred card from `sm`.
 * Focus trap, Escape, scroll lock, focus restore and a labelled title come
 * from Radix. It stacks at z-50 like every other Radix layer, so order is
 * portal order: a ConfirmDialog opened from inside a Modal sits on top.
 */
function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  return (
    <DialogLayer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      described={Boolean(description)}
      overlayClassName="flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center"
      className={cn(
        'relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-lg border border-border bg-card shadow-float sm:rounded-lg',
        wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
      )}
      // The first field, else the first button that isn't the header's
      // close — never the X, which Radix would pick by default.
      onOpenAutoFocus={(e) => {
        const panel = e.currentTarget as HTMLElement | null
        const target =
          panel?.querySelector<HTMLElement>('input, textarea, select') ??
          panel?.querySelector<HTMLElement>('button:not([data-close]):not([disabled])')
        if (target) {
          e.preventDefault()
          target.focus()
        }
      }}
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <DialogTitle className="text-title font-semibold text-foreground">{title}</DialogTitle>
          {description && (
            <DialogDescription className="mt-0.5 text-meta text-muted-foreground">{description}</DialogDescription>
          )}
        </div>
        <Button variant="quiet" size="icon-sm" data-close onClick={onClose} aria-label="Close">
          <XIcon aria-hidden="true" />
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</footer>}
    </DialogLayer>
  )
}

export {
  Dialog,
  DialogLayer,
  Modal,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
