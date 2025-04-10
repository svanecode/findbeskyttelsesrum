'use client';

import { motion } from 'framer-motion';

export default function GlobalFooter() {
  return (
    <motion.footer 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 1 }}
      className="footer mt-4 sm:mt-8 text-center text-[10px] sm:text-xs text-gray-400 px-4"
    >
      <p className="font-mono opacity-60">🏛️ Bemærk: Denne tjeneste er uafhængig og er ikke tilknyttet, drevet eller godkendt af den danske stat eller nogen offentlige myndigheder.</p>
    </motion.footer>
  );
} 