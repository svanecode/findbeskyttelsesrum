'use client'

import React from 'react'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  text?: string
  className?: string
}

export default function LoadingSpinner({ 
  size = 'md', 
  text, 
  className = '' 
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  }

  return (
    <div className={`flex flex-col items-center justify-center space-y-3 ${className}`}>
      <div className="relative">
        <div className={`${sizeClasses[size]} border-2 border-white/20 rounded-full`}></div>
        <div className={`${sizeClasses[size]} border-2 border-[#F97316] border-t-transparent rounded-full animate-spin absolute top-0 left-0`}></div>
      </div>
      {text && (
        <p className="text-sm text-gray-400 animate-pulse">
          {text}
        </p>
      )}
    </div>
  )
}

// Skeleton loading components
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse ${className}`}>
      <div className="bg-white/10 rounded-lg p-4 space-y-3">
        <div className="h-4 bg-white/20 rounded w-3/4"></div>
        <div className="h-3 bg-white/10 rounded w-1/2"></div>
        <div className="h-3 bg-white/10 rounded w-2/3"></div>
      </div>
    </div>
  )
}

export function SkeletonMap({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-white/5 rounded-lg ${className}`}>
      <div className="h-full w-full bg-gradient-to-br from-white/10 to-white/5 rounded-lg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 bg-white/20 rounded-full mx-auto"></div>
          <div className="space-y-2">
            <div className="h-4 bg-white/20 rounded w-32 mx-auto"></div>
            <div className="h-3 bg-white/10 rounded w-24 mx-auto"></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SkeletonList({ count = 3, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
