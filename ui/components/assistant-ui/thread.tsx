"use client";

import type { PlannerChatImage } from "@viberoute/shared";
import {
  ActionBarPrimitive,
  AttachmentPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  MessagePartPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CoffeeIcon,
  CopyIcon,
  FuelIcon,
  PlusIcon,
  RefreshCwIcon,
  ShoppingBagIcon,
  SquareIcon,
  SunsetIcon,
  UtensilsIcon,
} from "lucide-react";
import { type FC, type ReactNode, useCallback, useEffect, useState } from "react";

export const Thread: FC<{
  images: PlannerChatImage[];
}> = ({ images }) => {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col bg-[#101116]">
      <ThreadPrimitive.Viewport className="flex flex-1 flex-col overflow-y-auto scroll-smooth bg-[#101116] px-5 pt-4">
        <AuiIf condition={(state) => state.thread.isEmpty}>
          <ThreadWelcome />
        </AuiIf>

        <ThreadPrimitive.Messages>
          {() => <ThreadMessage />}
        </ThreadPrimitive.Messages>

        <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mt-auto flex flex-col gap-3 border-t border-white/[0.06] bg-[#101116] pb-4 pt-3 shadow-[0_-20px_40px_rgba(16,17,22,0.98)]">
          <ThreadScrollToBottom />
          <PersistentImageGallery images={images} />
          <QuickActions />
          <Composer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadMessage: FC = () => {
  const role = useAuiState((state) => state.message.role);
  if (role === "user") {
    return <UserMessage />;
  }
  return <AssistantMessage />;
};

const ThreadScrollToBottom: FC = () => (
  <ThreadPrimitive.ScrollToBottom asChild>
    <button className="absolute -top-10 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-white/[0.06] bg-[#18191f] p-2 text-white/50 shadow-lg transition hover:bg-[#20222a] hover:text-white/70 disabled:invisible">
      <ArrowDownIcon className="size-4" />
    </button>
  </ThreadPrimitive.ScrollToBottom>
);

const ThreadWelcome: FC = () => (
  <div className="flex grow items-center justify-center px-8">
    <p className="max-w-xs text-center text-[28px] font-medium leading-tight tracking-tight text-white/[0.14]">
      How do you want your day to look like today?
    </p>
  </div>
);

const QUICK_ACTIONS: { icon: ReactNode; label: string; prompt: string }[] = [
  { icon: <UtensilsIcon className="size-3.5" />, label: "Add dinner", prompt: "Add a dinner stop to my plan" },
  { icon: <CoffeeIcon className="size-3.5" />, label: "Add café", prompt: "Add a coffee shop or café stop" },
  { icon: <FuelIcon className="size-3.5" />, label: "Add gas station", prompt: "Add a gas station stop along the route" },
  { icon: <ShoppingBagIcon className="size-3.5" />, label: "Add shopping", prompt: "Add a shopping stop to my plan" },
  { icon: <SunsetIcon className="size-3.5" />, label: "Add sunset spot", prompt: "Add a scenic sunset viewpoint stop" },
];

const QuickActions: FC = () => {
  const api = useAui();
  const handleClick = useCallback(
    (prompt: string) => {
      const composer = api.composer();
      composer.setText(prompt);
      composer.send();
    },
    [api],
  );

  return (
    <div className="flex flex-wrap gap-1.5">
      {QUICK_ACTIONS.map((action) => (
        <button
          key={action.label}
          onClick={() => handleClick(action.prompt)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[12px] text-white/50 transition hover:border-white/[0.16] hover:bg-white/[0.04] hover:text-white/70"
        >
          {action.icon}
          {action.label}
        </button>
      ))}
    </div>
  );
};

const Composer: FC = () => (
  <ComposerPrimitive.Root className="relative flex w-full flex-col rounded-xl border border-white/[0.06] bg-[#18191f] transition-all focus-within:border-white/[0.12] focus-within:bg-[#1d1f27]">
    <div className="flex flex-wrap gap-2 px-3 pt-3">
      <ComposerPrimitive.Attachments>
        {() => <ComposerAttachment />}
      </ComposerPrimitive.Attachments>
    </div>
    <ComposerPrimitive.Input
      placeholder="Describe the day you want..."
      className="max-h-32 min-h-[2.75rem] w-full resize-none bg-transparent px-4 py-3 text-[13px] text-white/80 outline-none placeholder:text-white/25"
      rows={1}
      autoFocus
    />
    <div className="flex items-center justify-between px-3 pb-2">
      <ComposerPrimitive.AddAttachment asChild>
        <button
          className="rounded-lg p-1.5 text-white/30 transition hover:bg-white/[0.06] hover:text-white/60"
          aria-label="Add photos"
        >
          <PlusIcon className="size-4" />
        </button>
      </ComposerPrimitive.AddAttachment>
      <ComposerAction />
    </div>
  </ComposerPrimitive.Root>
);

const ComposerAttachment: FC = () => (
  <AttachmentPrimitive.Root className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#20222a]">
    <AttachmentPreview
      className="h-16 w-16 object-cover"
      emptyClassName="flex h-16 w-16 items-center justify-center bg-white/[0.05] text-xs uppercase text-white/45"
    />
    <AttachmentPrimitive.Remove asChild>
      <button
        className="absolute right-2 top-2 rounded-full bg-black/55 p-1 text-white/65 opacity-100 transition hover:bg-black/75 hover:text-white"
        aria-label="Remove attachment"
      >
        <PlusIcon className="size-3 rotate-45" />
      </button>
    </AttachmentPrimitive.Remove>
  </AttachmentPrimitive.Root>
);

const PersistentImageGallery: FC<{
  images: PlannerChatImage[];
}> = ({ images }) => {
  if (!images.length) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#18191f] p-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {images.map((image) => (
          <div
            key={image.dataUrl}
            className="shrink-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#20222a]"
          >
            <img
              src={image.dataUrl}
              alt={image.filename ?? "Uploaded inspiration"}
              className="h-16 w-16 object-cover md:h-20 md:w-20"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

const ComposerAction: FC = () => (
  <div className="flex items-center gap-1">
    <AuiIf condition={(state) => !state.thread.isRunning}>
      <ComposerPrimitive.Send asChild>
        <button
          className="rounded-lg bg-indigo-500 p-1.5 text-white transition hover:bg-indigo-400"
          aria-label="Send message"
        >
          <ArrowUpIcon className="size-4" />
        </button>
      </ComposerPrimitive.Send>
    </AuiIf>
    <AuiIf condition={(state) => state.thread.isRunning}>
      <ComposerPrimitive.Cancel asChild>
        <button
          className="rounded-lg bg-[#2a2c36] p-1.5 text-white/60 transition hover:bg-[#343744]"
          aria-label="Stop"
        >
          <SquareIcon className="size-3 fill-current" />
        </button>
      </ComposerPrimitive.Cancel>
    </AuiIf>
  </div>
);

const AssistantMessage: FC = () => (
  <MessagePrimitive.Root className="relative mx-auto w-full animate-[fadeIn_150ms_ease] py-2">
    <div className="flex flex-col gap-3 px-1">
      <MessagePrimitive.Parts
        components={{
          Text: AssistantTextPart,
          Reasoning: AssistantReasoningPart,
        }}
      />
    </div>
    <div className="mt-1 flex min-h-5 items-center gap-1">
      <BranchPicker />
      <AssistantActionBar />
    </div>
  </MessagePrimitive.Root>
);

const AssistantTextPart: FC = () => (
  <div className="text-[13px] leading-relaxed text-white/70">
    <MessagePartPrimitive.Text />
    <MessagePartPrimitive.InProgress>
      <span className="ml-1 inline-block text-white/35">●</span>
    </MessagePartPrimitive.InProgress>
  </div>
);

const AssistantReasoningPart: FC = () => (
  <div className="rounded-xl border border-white/[0.06] bg-[#18191f] px-3 py-2">
    <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white/30">
      Thinking
    </div>
    <div className="text-[11px] leading-relaxed text-white/50">
      <MessagePartPrimitive.Text />
      <MessagePartPrimitive.InProgress>
        <span className="ml-1 inline-block text-white/35">●</span>
      </MessagePartPrimitive.InProgress>
    </div>
  </div>
);

const AssistantActionBar: FC = () => (
  <ActionBarPrimitive.Root
    hideWhenRunning
    autohide="not-last"
    className="-ml-1 flex gap-1 text-white/25"
  >
    <ActionBarPrimitive.Copy asChild>
      <button
        className="rounded-lg p-1 transition hover:bg-white/[0.06] hover:text-white/50"
        aria-label="Copy"
      >
        <AuiIf condition={(state) => state.message.isCopied}>
          <CheckIcon className="size-3.5" />
        </AuiIf>
        <AuiIf condition={(state) => !state.message.isCopied}>
          <CopyIcon className="size-3.5" />
        </AuiIf>
      </button>
    </ActionBarPrimitive.Copy>
    <ActionBarPrimitive.Reload asChild>
      <button
        className="rounded-lg p-1 transition hover:bg-white/[0.06] hover:text-white/50"
        aria-label="Regenerate"
      >
        <RefreshCwIcon className="size-3.5" />
      </button>
    </ActionBarPrimitive.Reload>
  </ActionBarPrimitive.Root>
);

const UserMessage: FC = () => {
  const hasText = useAuiState((state) =>
    state.message.content.some(
      (part) => part.type === "text" && part.text.trim().length > 0,
    ),
  );

  return (
    <MessagePrimitive.Root className="mx-auto grid w-full animate-[fadeIn_150ms_ease] auto-rows-auto grid-cols-[1fr_auto] gap-y-1 py-2">
      <div className="col-start-2 flex max-w-full flex-col gap-2">
        {hasText ? (
          <div className="rounded-xl border border-indigo-400/20 bg-[#232544] px-4 py-2.5 text-[13px] text-white/80">
            <MessagePrimitive.Content />
          </div>
        ) : null}
      </div>
      <BranchPicker className="col-span-full col-start-1 row-start-2 justify-end" />
    </MessagePrimitive.Root>
  );
};

type AttachmentContentPart =
  | {
      type: "image";
      image: string;
    }
  | {
      type: "file";
      data: string;
      mimeType: string;
    };

type AttachmentState = {
  id?: string;
  name: string;
  file?: File;
  contentType?: string;
  content?: readonly AttachmentContentPart[];
};

const AttachmentPreview: FC<{
  className: string;
  emptyClassName: string;
}> = ({ className, emptyClassName }) => {
  const attachment = useAuiState((state) => state.attachment) as AttachmentState;
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!attachment.file) {
      setFileUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(attachment.file);
    setFileUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.file]);

  const src = _getAttachmentPreviewSrc(attachment) ?? fileUrl;
  if (src) {
    return <img src={src} alt={attachment.name} className={className} />;
  }

  return (
    <div className={emptyClassName}>
      .{_getAttachmentExtension(attachment.name)}
    </div>
  );
};

function _getAttachmentPreviewSrc(attachment: AttachmentState): string | null {
  for (const part of attachment.content ?? []) {
    if (part.type === "image") {
      return part.image;
    }
    if (part.type === "file" && part.mimeType.startsWith("image/")) {
      return `data:${part.mimeType};base64,${part.data}`;
    }
  }

  return null;
}

function _getAttachmentExtension(filename: string): string {
  const extension = filename.split(".").pop()?.trim().toLowerCase();
  return extension || "file";
}

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => (
  <BranchPickerPrimitive.Root
    hideWhenSingleBranch
    className={`-ml-1 inline-flex items-center text-xs text-white/40 ${className ?? ""}`}
    {...rest}
  >
    <BranchPickerPrimitive.Previous asChild>
      <button
        className="rounded-full p-0.5 transition hover:bg-white/10 hover:text-white/70"
        aria-label="Previous"
      >
        <ChevronLeftIcon className="size-3.5" />
      </button>
    </BranchPickerPrimitive.Previous>
    <span className="font-medium tabular-nums">
      <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
    </span>
    <BranchPickerPrimitive.Next asChild>
      <button
        className="rounded-full p-0.5 transition hover:bg-white/10 hover:text-white/70"
        aria-label="Next"
      >
        <ChevronRightIcon className="size-3.5" />
      </button>
    </BranchPickerPrimitive.Next>
  </BranchPickerPrimitive.Root>
);
