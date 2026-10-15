import * as React from 'react'

import { cn } from '@/lib/utils'
import { FIELD_CLASS } from '@/components/ui/input'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(FIELD_CLASS, 'flex field-sizing-content min-h-20', className)}
      {...props}
    />
  )
}

export { Textarea }
