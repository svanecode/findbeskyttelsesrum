'use client';

import { useEffect, useState } from 'react';
import { useErrorHandler } from '@/hooks/useErrorHandler';

interface ShelterCounterProps {
  targetNumber: number;
  version: string;
}

export default function ShelterCounter({ targetNumber, version }: ShelterCounterProps) {
  const [count, setCount] = useState(targetNumber);
  const [isClient, setIsClient] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const { handleError } = useErrorHandler();

  useEffect(() => {
    if (targetNumber <= 0) {
      handleError(new Error('Invalid target number'), `Target number must be positive, got: ${targetNumber}`);
      return;
    }

    setIsClient(true);
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

  return (
    <div className="text-center mt-8" role="status" aria-live="polite">
      <div 
        className={`text-2xl sm:text-3xl font-bold text-[#F97316] transition-all duration-300 ${
          isAnimating ? 'scale-105' : 'scale-100'
        }`}
        aria-label={`${count.toLocaleString('da-DK')} sikringspladser i databasen`}
      >
        {isClient ? count.toLocaleString('da-DK') : targetNumber.toLocaleString('da-DK')}
      </div>
      <div className="text-sm sm:text-base text-[#E5E7EB] mt-2">
        sikringspladser i databasen
      </div>
      {isAnimating && (
        <div className="text-xs text-gray-500 mt-1" aria-hidden="true">
          Opdaterer...
        </div>
      )}
    </div>
  );
} 