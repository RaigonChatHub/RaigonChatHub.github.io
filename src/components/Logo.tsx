import React from 'react';
import Image from 'next/image';

const Logo = ({ className }: { className?: string }) => {
  return <Image src="/logo.png" alt="Raigon Chat Hub" width={512} height={512} className={`${className ?? ''} object-contain`} priority />;
};

export default Logo;
