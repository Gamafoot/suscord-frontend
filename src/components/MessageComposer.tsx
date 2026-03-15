interface MessageComposerProps {
  disabled: boolean;
  text: string;
  files: File[];
  onTextChange: (value: string) => void;
  onFilesChange: (files: File[]) => void;
  onSubmit: () => Promise<void>;
}

export function MessageComposer({
  disabled,
  text,
  files,
  onTextChange,
  onFilesChange,
  onSubmit,
}: MessageComposerProps) {
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit();
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      {files.length ? (
        <div className="composer__files">
          {files.map((file) => (
            <span key={`${file.name}-${file.lastModified}`} className="file-pill">
              <i className="bi bi-paperclip" />
              {file.name}
            </span>
          ))}
        </div>
      ) : null}

      <div className="composer__controls">
        <label className="btn btn-icon" title="Прикрепить файлы">
          <i className="bi bi-plus-lg" />
          <input
            hidden
            type="file"
            multiple
            onChange={(event) => onFilesChange(Array.from(event.target.files ?? []))}
          />
        </label>

        <input
          className="form-control composer__input"
          placeholder="Написать сообщение"
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          disabled={disabled}
        />

        <button className="btn btn-brand" type="submit" disabled={disabled || (!text.trim() && files.length === 0)}>
          <i className="bi bi-send-fill" />
        </button>
      </div>
    </form>
  );
}
