import { getInitials } from '../lib/utils';
import { MediaImage } from './MediaImage';

interface AvatarProps {
  name?: string | null;
  url?: string | null;
  size?: 'sm' | 'md' | 'lg';
  accent?: 'brand' | 'warm';
}

export function Avatar({ name, url, size = 'md', accent = 'brand' }: AvatarProps) {
  const classes = ['avatar', `avatar-${size}`, `avatar-${accent}`].join(' ');
  const safeName = name?.trim() || 'Неизвестный пользователь';
  const fallback = <div className={classes}>{getInitials(safeName)}</div>;

  return <MediaImage className={classes} src={url} alt={safeName} fallback={fallback} />;
}
