import type { Attachment } from '../types';
import { formatFileSize, getAttachmentExtension, getAttachmentName, resolveMediaUrl } from '../lib/utils';
import { MediaImage } from './MediaImage';
import { useAuthenticatedMediaSource } from './useAuthenticatedMediaSource';

interface MessageAttachmentProps {
  attachment: Attachment;
}

function getAttachmentKind(mimeType: string, extension: string): 'image' | 'video' | 'audio' | 'file' {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }

  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic', 'heif'].includes(extension)) {
    return 'image';
  }
  if (['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv', 'ogg'].includes(extension)) {
    return 'video';
  }
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'].includes(extension)) {
    return 'audio';
  }

  return 'file';
}

export function MessageAttachment({ attachment }: MessageAttachmentProps) {
  const src = resolveMediaUrl(attachment.file_url);
  const mediaSrc = useAuthenticatedMediaSource(attachment.file_url);
  const fileName = getAttachmentName(attachment.file_url, attachment.file_name);
  const fileExtension = getAttachmentExtension(attachment.file_url, attachment.file_name);
  const fileMeta = [attachment.mime_type, formatFileSize(attachment.file_size)].filter(Boolean).join(' · ');
  const kind = getAttachmentKind(attachment.mime_type, fileExtension);

  if (kind === 'image') {
    return (
      <a href={src} className="attachment-card" target="_blank" rel="noreferrer">
        <MediaImage src={attachment.file_url} alt={fileName} />
      </a>
    );
  }

  if (kind === 'video') {
    return (
      <div className="attachment-video">
        {mediaSrc ? <video className="attachment-video__player" controls preload="metadata" src={mediaSrc} /> : null}
        <div className="attachment-video__meta">
          <strong>{fileName}</strong>
          {fileMeta ? <small>{fileMeta}</small> : null}
        </div>
      </div>
    );
  }

  if (kind === 'audio') {
    return (
      <div className="attachment-audio">
        <div className="attachment-audio__meta">
          <i className="bi bi-music-note-beamed" />
          <span>
            <strong>{fileName}</strong>
            {fileMeta ? <small>{fileMeta}</small> : null}
          </span>
        </div>
        {mediaSrc ? <audio className="attachment-audio__player" controls preload="metadata" src={mediaSrc} /> : null}
      </div>
    );
  }

  return (
      <div className="attachment-file">
      <div className="attachment-file__icon">
        <i className="bi bi-file-earmark-arrow-down" />
      </div>
      <div className="attachment-file__content">
        <strong className="attachment-file__name">{fileName}</strong>
        {fileMeta ? <small className="attachment-file__meta">{fileMeta}</small> : null}
      </div>
      <a href={src} className="attachment-file__download" download={fileName}>
        Скачать
      </a>
    </div>
  );
}
