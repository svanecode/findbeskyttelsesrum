'use client';

import { useEffect, useRef, useState } from 'react';
import { useErrorHandler } from '@/hooks/useErrorHandler';

interface ShelterCounterProps {
  targetNumber: number | null;
  version: string;
}

export default function ShelterCounter({ targetNumber, version }: ShelterCounterProps) {
  const [count, setCount] = useState(targetNumber ?? 0);
  const [isClient, setIsClient] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const { handleError } = useErrorHandler();
  const hasMountedRef = useRef(false);

  useEffect(() => {
    setIsClient(true);

    if (targetNumber === null) {
      setCount(0);
      setIsAnimating(false);
      return;
    }

    if (targetNumber <= 0) {
      handleError(new Error('Invalid target number'), `Target number must be positive, got: ${targetNumber}`);
      return;
    }

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      setCount(targetNumber);
      setIsAnimating(false);
      return;
    }

    setCount(0);
    setIsAnimating(true);
    
    const duration = 2000; // 2 seconds
    const steps = 60;
    const increment = targetNumber / steps;
    let currentStep = 0;

    const timer = setInterval(() => {
      try {
        currentStep++;
        const newCount = Math.min(Math.floor(increment * currentStep), targetNumber);
        setCount(newCount);

        if (currentStep >= steps) {
          clearInterval(timer);
          setIsAnimating(false);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Animation error');
        handleError(err, 'ShelterCounter animation failed');
        clearInterval(timer);
        setIsAnimating(false);
      }
    }, duration / steps);

    return () => {
      clearInterval(timer);
      setIsAnimating(false);
    };
  }, [targetNumber, handleError]);

  const displayValue = targetNumber === null
    ? '—'
    : isClient
      ? count.toLocaleString('da-DK')
      : targetNumber.toLocaleString('da-DK');

  const ariaLabel = targetNumber === null
    ? 'Antal sikringspladser er ikke tilgængeligt'
    : `${(isClient ? count : targetNumber).toLocaleString('da-DK')} sikringspladser i databasen`;

  return (
    <div className="text-center mt-6 sm:mt-8 lg:mt-10" role="status" aria-live="polite">
      <div 
        className={`text-heading-sm sm:text-heading-md lg:text-heading-lg text-[#F97316] transition-all duration-300 ${
          isAnimating ? 'scale-105' : 'scale-100'
        }`}
        aria-label={ariaLabel}
      >
        {displayValue}
      </div>
      <div className="text-body-sm sm:text-body-md lg:text-body-lg text-[#E5E7EB] mt-3 sm:mt-4 font-medium">
        sikringspladser i databasen
      </div>
      {isAnimating && (
        <div className="text-caption text-gray-500 mt-3" aria-hidden="true">
          Opdaterer...
        </div>
      )}
    </div>
  );
} 
