import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";

import { onboardingForm } from "@/app/(main)/store/account";
import BoldIcon from "@/assets/icons/BoldIcon";
import EmojiIcon from "@/assets/icons/EmojiIcon";
import ItalicIcon from "@/assets/icons/ItalicIcon";
import UnderlineIcon from "@/assets/icons/UnderlineIcon";
import { useAtom } from "jotai";
import React from "react";

const RichTextEditor = () => {
  const [selectedModes, setSelectedModes] = React.useState<string[]>([]);

  const editorRef = React.useRef<HTMLDivElement>(null);
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false);

  const [form, setForm] = useAtom(onboardingForm);

  const formatDoc = React.useCallback(
    (cmd: string, value?: string) => {
      if (editorRef.current) {
        if (selectedModes.includes(cmd)) {
          setSelectedModes(selectedModes.filter((e) => e !== cmd));
        } else {
          setSelectedModes([...selectedModes, cmd]);
        }
        editorRef.current.focus();
        document.execCommand(cmd, false, value);
      }
    },
    [selectedModes],
  );

  const insertEmoji = React.useCallback((emoji: any) => {
    if (editorRef.current) {
      editorRef.current.focus();
      document.execCommand("insertHTML", false, emoji.native);
      setShowEmojiPicker(false);
    }
  }, []);

  const handleContentChange = React.useCallback(
    (event: any) => {
      if (form.bio.length >= 280) return;

      setForm({ ...form, bio: event.target.innerHTML });
    },
    [form],
  );

  React.useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = form.bio;
    }
  }, []);

  return (
    <div className="border-[1px] border-[#FFFFFF30] rounded-lg flex flex-col relative">
      <div
        ref={editorRef}
        contentEditable={true}
        onInput={handleContentChange} // Use onInput to track changes
        className="p-6 h-64 relative"
        data-text="Minimum of 25 characters. Maximum 280 characters"
      />
      <div className="px-3 py-1 flex items-center space-x-2 relative border-t border-t-[#FFFFFF30]">
        <button
          onClick={() => formatDoc("bold")}
          className={`p-3 rounded-lg hover:bg-sky-600 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-sky-500 ${selectedModes.includes("bold") && "bg-sky-800"}`}
          title="Bold"
        >
          <BoldIcon />
        </button>
        <button
          onClick={() => formatDoc("italic")}
          className={`p-3 rounded-lg hover:bg-sky-600 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-sky-500 ${selectedModes.includes("italic") && "bg-sky-800"}`}
          title="Italic"
        >
          <ItalicIcon />
        </button>
        <button
          onClick={() => formatDoc("underline")}
          className={`p-3 rounded-lg hover:bg-sky-600 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-sky-500 ${selectedModes.includes("underline") && "bg-sky-800"}`}
          title="Underline"
        >
          <UnderlineIcon />
        </button>
        <div className="relative">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className={`p-3 rounded-lg hover:bg-sky-600 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-sky-500`}
            title="Add Emoji"
          >
            <EmojiIcon />
          </button>
          {showEmojiPicker && (
            <div className="absolute z-10 bottom-[50px]">
              <Picker
                data={data}
                onEmojiSelect={insertEmoji}
                onClickOutside={() => setShowEmojiPicker(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RichTextEditor;
