// @tailwindcss/typography is not installed, so StarterKit's nodes are styled explicitly
// (Tailwind's preflight resets headings, lists, etc. to unstyled).
export const RICH_TEXT_CLASSES = [
  "[&_.ProseMirror]:outline-none",
  "[&_.ProseMirror>*+*]:mt-3",
  "[&_h1]:text-2xl [&_h1]:font-bold",
  "[&_h2]:text-xl [&_h2]:font-semibold",
  "[&_h3]:text-lg [&_h3]:font-semibold",
  "[&_ul]:list-disc [&_ul]:pl-6",
  "[&_ol]:list-decimal [&_ol]:pl-6",
  "[&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-sm",
  "[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_hr]:my-4 [&_hr]:border-border",
  "[&_strong]:font-bold [&_em]:italic [&_s]:line-through",
].join(" ");
