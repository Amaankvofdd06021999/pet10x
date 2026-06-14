"use client"

import type { ReactNode } from "react"

interface IOSNavBarProps {
  title: string
  largeTitle?: boolean
  leftAction?: ReactNode
  rightAction?: ReactNode
}

export function IOSNavBar({ title, largeTitle = true, leftAction, rightAction }: IOSNavBarProps) {
  return (
    <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-xl pt-safe">
      {!largeTitle && (
        <div className="flex h-11 items-center justify-between px-4">
          <div className="flex min-w-[60px] items-center">{leftAction}</div>
          <h1 className="text-[17px] font-semibold text-foreground">{title}</h1>
          <div className="flex min-w-[60px] items-center justify-end">{rightAction}</div>
        </div>
      )}
      {largeTitle && (
        <>
          <div className="flex h-11 items-center justify-between px-4">
            <div className="flex min-w-[60px] items-center">{leftAction}</div>
            <div className="flex-1" />
            <div className="flex min-w-[60px] items-center justify-end">{rightAction}</div>
          </div>
          <div className="px-4 pb-2">
            <h1 className="text-[34px] font-bold leading-tight tracking-tight text-foreground">{title}</h1>
          </div>
        </>
      )}
    </header>
  )
}
