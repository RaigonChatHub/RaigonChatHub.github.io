import React from 'react';
import Image from 'next/image';
import { appPath } from '@/lib/paths';

const Logo = ({ className }: { className?: string }) => {
  return <Image src={appPath('/logo.png')} alt="Raigon Chat Hub" width={512} height={512} className={`${className ?? ''} object-contain`} priority />;
};

export default Logo;
