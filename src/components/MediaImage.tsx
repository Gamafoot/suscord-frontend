import { useEffect, useState } from 'react';
import type { ImgHTMLAttributes, ReactNode } from 'react';
import { useAuthenticatedMediaSource } from './useAuthenticatedMediaSource';

interface MediaImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null;
  fallback?: ReactNode;
}

export function MediaImage({ src, alt, fallback = null, onError, ...props }: MediaImageProps) {
  const resolvedSrc = useAuthenticatedMediaSource(src);
  const [displaySrc, setDisplaySrc] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setDisplaySrc(resolvedSrc);
    setFailed(false);
  }, [resolvedSrc]);

  if (!displaySrc || failed) {
    return <>{fallback}</>;
  }

  return (
    <img
      {...props}
      src={displaySrc}
      alt={alt}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}
