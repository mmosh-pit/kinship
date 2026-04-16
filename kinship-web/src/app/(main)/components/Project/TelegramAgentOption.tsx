import TelegramIcon from "@/assets/icons/TelegramIcon";
import React from "react";
import Input from "../common/Input";
import axios, { AxiosError } from "axios";
import RemoveIcon from "@/assets/icons/RemoveIcon";
import EditIcon from "@/assets/icons/EditIcon";
import Button from "../common/Button";
import internalClient from "@/app/(main)/lib/internalHttpClient";

interface TelegramGroup {
  id: string;
  // handle: string;
  // botToken: string;
  groupLink: string;
  status: string;
  // instructions: string;
}

const TelegramAgentOption = ({ project }: { project: string }) => {
  const [groups, setGroups] = React.useState<TelegramGroup[]>([]);
  const [handle, setHandle] = React.useState("");
  const [status, setStatus] = React.useState("open");
  const [botToken, setBotToken] = React.useState("");
  const [groupLink, setGroupLink] = React.useState("");
  const [instructions, setInstructions] = React.useState("");
  const [haveBot, setBot] = React.useState(false);
  const [docId, setDocId] = React.useState("");
  const [isEdit, setEdit] = React.useState(false);
  const [editSnapshot, setEditSnapshot] = React.useState<{
    handle: string;
    botToken: string;
    instructions: string;
  } | null>(null);

  const [telegramConnections, setTelegramConnections] = React.useState<
    TelegramConnection[]
  >([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [showMsg, setShowMsg] = React.useState(false);
  const [msgClass, setMsgClass] = React.useState("");
  const [msgText, setMsgText] = React.useState("");

  const getTelegramConnections = React.useCallback(async () => {
    const response = await internalClient.get(
      `/api/project/project-tools?project=${project}&type=telegram`,
    );

    /* setTelegramConnections(
      response.data.map((val: any) => ({
        handle: val.data.handle,
        privacy: val.data.privacy,
        instructions: val.data.instructions,
        botToken: val.data?.botToken || "",
        groupLink: val.data?.groupLink || ""
      })),
    ); */
    const responseData = response.data.length > 0 ? response.data[0] : {};
    console.log(responseData, "resppppdataaa")
    setDocId(responseData?._id || "");
    setGroups(responseData?.groups || []);
    setBotToken(responseData?.data?.botToken || "");
    setHandle(responseData?.data?.handle || ""); 
    setInstructions(responseData?.data?.instructions || "");
    setBot(!!responseData?.data?.botToken);
  }, [project]);

  React.useEffect(() => {
    getTelegramConnections();
  }, [project]);

  const createMessage = React.useCallback((message: any, type: any) => {
    window.scrollTo(0, 0);
    setMsgText(message);
    setMsgClass(type);
    setShowMsg(true);
    if (type == "success-container") {
      setTimeout(() => {
        setShowMsg(false);
      }, 4000);
    } else {
      setTimeout(() => {
        setShowMsg(false);
      }, 4000);
    }
  }, []);

  const addTool = React.useCallback(() => {
    setIsLoading(true);
    internalClient
      .post("/api/project/save-project-tool", {
        type: "telegram",
        project,
        data: {
          // groups: groups,
          handle: handle,
          botToken: botToken,
          instructions: instructions,
        }},
      )
      .then((_) => {
        setIsLoading(false);
        // setGroups([]);
        // turn off edit mode after successful save
        setEdit(false);
        createMessage(
          "Successfully added Telegram Groups to your Agent",
          "success-container",
        );
      })
      .catch((err: AxiosError) => {
        console.log(err.response?.data, "===error")
        setIsLoading(false);
        if (err.response?.data === "telegram-exists") {
          createMessage(
            "Some Telegram Groups have already been saved",
            "danger-container",
          );
        } else {
          console.log("==elseee")
          createMessage(
            "Unknown error occurred, please try again",
            "danger-container",
          );
        }
      });
  }, [project, handle, botToken, instructions, createMessage]);

  const onEditClick = React.useCallback(() => {
    // take a snapshot to restore on cancel
    setEditSnapshot({ handle, botToken, instructions });
    setEdit(true);
  }, []);

  const onCancelEdit = React.useCallback(async () => {
    // Revert to snapshot values if present
    if (editSnapshot) {
      setHandle(editSnapshot.handle);
      setBotToken(editSnapshot.botToken);
      setInstructions(editSnapshot.instructions);
      setEditSnapshot(null);
    }
    setEdit(false);
  }, [getTelegramConnections]);

  const removeBot = React.useCallback(async () => {
    if (!handle) {
      createMessage("No bot is currently configured", "danger-container");
      return;
    }

    try {
      setIsLoading(true);
      await internalClient.delete(
        `/api/project/remove-telegram-tool?project=${project}&handle=${handle}&type=telegram&docId=${docId}`,
      );

      // Clear local state
      setBot(false);
      setHandle("");
      setBotToken("");
      setInstructions("");
      setEdit(false);
      setGroupLink("");
      setGroups([]);

      createMessage("Bot removed successfully", "success-container");
    } catch (err) {
      console.log(err, "delete-bot-error");
      createMessage("Failed to remove bot", "danger-container");
    } finally {
      setIsLoading(false);
    }
  }, [handle, project, createMessage]);

  const handleButtonAction = React.useCallback((title: string) => {
    const t = title?.toLowerCase?.() || "";

    if (t === "edit") {
      setEdit(true);
      return;
    }

    if (t === "cancel") {
      // If a bot exists revert inputs, otherwise clear the form
      if (haveBot) {
        onCancelEdit();
      } else {
        setHandle("");
        setBotToken("");
        setInstructions("");
      }
      return;
    }

    if (t === "save") {
      addTool();
      return;
    }

    if (t === "delete") {
      removeBot();
      return;
    }

    // fallback
    console.warn("Unhandled button action", title);
  }, [haveBot, onCancelEdit, addTool, removeBot]);

  const addGroupTool = React.useCallback(() => {
    if (groups.length === 0) {
      createMessage("Please add at least one group", "danger-container");
      return;
    }

    for (const group of groups) {
      if (!group.groupLink || !group.status) {
        createMessage("Please fill in all required fields for each group", "danger-container");
        return;
      }
      if (groups.filter(g => g.groupLink === group.groupLink).length > 1) {
        createMessage("Duplicate group links are not allowed", "danger-container");
        return;
      }
    }

    setIsLoading(true);
    internalClient
      .post("/api/project/save-project-tool", {
        type: "telegram_group",
        project,
        data: {
          groups: groups,
        }},
      )
      .then((_) => {
        setIsLoading(false);
        // setGroups([]);

        createMessage(
          "Successfully added Telegram Groups to your Agent",
          "success-container",
        );
      })
      .catch((err: AxiosError) => {
        console.log(err.response?.data, "===error")
        setIsLoading(false);
        if (err.response?.data === "telegram-exists") {
          createMessage(
            "Some Telegram Groups have already been saved",
            "danger-container",
          );
        } else {
          console.log("==elseee")
          createMessage(
            "Unknown error occurred, please try again",
            "danger-container",
          );
        }
      });
  }, [groups, createMessage]);

  const removeGroup = React.useCallback(async (handle: string) => {
    setIsLoading(true);
    await internalClient.delete(
      `/api/project/remove-telegram-tool?project=${project}&handle=${handle}`,
    );

    setIsLoading(false);

    setTelegramConnections((prev) => {
      const newConns = [...prev].filter((e) => e.handle !== handle);

      return newConns;
    });
  }, [project]);

  const addGroupToArray = React.useCallback(() => {
    if (!status || !groupLink) {
      createMessage("Please fill in all required fields", "danger-container");
      return;
    }

    const newGroup: TelegramGroup = {
      id: Date.now().toString(),
      // handle,
      // botToken,
      groupLink,
      status,
      // instructions,
    };

    setGroups((prev) => [...prev, newGroup]);

    // Reset form
    // setHandle("");
    // setBotToken("");
    setGroupLink("");
    setStatus("open");
    // setInstructions("");
  }, [groupLink, status, createMessage]);

  const removeGroupFromArray = React.useCallback((id: string) => {
    setGroups((prev) => prev.filter((group) => group.id !== id));
  }, []);

  // Top-form editing state for groups (prefill fields and switch Add -> Save/Cancel)
  const [editingGroupId, setEditingGroupId] = React.useState<string | null>(null);
  const groupInputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const onEditGroup = React.useCallback((id: string) => {
    const group = groups.find((g) => g.id === id);
    if (!group) return;
    // Prefill the top form inputs so the user edits through the Add Group form
    setGroupLink(group.groupLink);
    setStatus(group.status);
    setEditingGroupId(id);
    // scroll and focus the top input after the DOM updates
    requestAnimationFrame(() => {
      const el = groupInputRef.current as unknown as HTMLElement | null;
      if (el && typeof el.scrollIntoView === "function") {
        try {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch (err) {
          // ignore
        }
      }

      try {
        // focus if possible
        (groupInputRef.current as HTMLInputElement | null)?.focus?.();
      } catch (err) {
        // ignore
      }
    });
  }, [groups]);

  const saveEditedGroup = React.useCallback(() => {
    if (!editingGroupId) return;

    if (!groupLink) {
      createMessage("Please fill the group link", "danger-container");
      return;
    }

    if (groups.filter((g) => g.groupLink === groupLink && g.id !== editingGroupId).length > 0) {
      createMessage("Duplicate group links are not allowed", "danger-container");
      return;
    }

    setGroups((prev) => prev.map((g) => (g.id === editingGroupId ? { ...g, groupLink, status } : g)));
    setEditingGroupId(null);
    setGroupLink("");
    setStatus("open");
  }, [editingGroupId, groupLink, status, groups, createMessage]);

  const cancelGroupEditFromTop = React.useCallback(() => {
    setEditingGroupId(null);
    setGroupLink("");
    setStatus("open");
  }, []);

React.useEffect(() => {
    console.log(haveBot, "haveBot")
  }
, [haveBot]);

  return (
    <div className="flex flex-col w-full md:w-[65%] lg:w-[45%] xl:w-[35%] px-4 md:px-0 my-4 md:my-0">
      {showMsg && (
        <div
          className={
            "message-container text-white text-center text-header-small-font-size py-5 px-3.5 mb-6 mt-2 " +
            msgClass
          }
        >
          {msgText}
        </div>
      )}
      <h5 className="mb-2">Telegram Bot</h5>
      <div className="flex flex-col items-center justify-center">
        {/* <div className="flex items-start mb-8">
          <div className="flex items-center bg-[#D9D9D938] border-[1px] border-[#FFFFFFEB] rounded-2xl cursor-pointer px-3 py-1 mx-4">
            <TelegramIcon width={18} height={15} />{" "}
            <p className="text-base text-white ml-1"> Telegram </p>
          </div>

          <div className="flex flex-col mx-4">
            <p className="text-sm text-white">
              Set{" "}
              <a
                className="text-sm text-white underline"
                href="https://t.me/KinshipChatBot"
                target="_blank"
              >
                KinshipChatBot
              </a>{" "}
              as an admin of a public group before adding this Telegram tool to
              your agent.
            </p>

            <div className="flex items-center mt-2">
              <p className="text-sm text-white">https://t.me/</p>

              <Input
                value={handle}
                onChange={(e) => {
                  console.log(e.target.value, "handlee")
                  setHandle(e.target.value)
                }}
                type="text"
                placeholder="Bot username"
                title="Bot Username"
                required={true}
                readonly={haveBot && !isEdit}
              />
              <span className="mr-2" />
              <Input
                value={botToken}
                onChange={(e) => {
                  console.log(e.target.value, "tokennn")
                  setBotToken(e.target.value)
                }}
                type="text"
                placeholder="Bot token"
                title="Bot Token"
                required={true}
                readonly={haveBot && !isEdit}
              />
            </div>
          </div>
        </div> */}
        <Input
          title="Instructions"
          placeholder="Enter instructions for the Agent to follow when interacting through this account."
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          type="text"
          textarea
          required={true}
          readonly={haveBot && !isEdit}
        />
        <div className="flex flex-col md:flex-row items-start md:items-center mb-8 mt-6 w-full gap-4">
          {/* <div className="flex flex-col mx-4"> */}

            {/* <div className="flex items-center mt-2"> */}
              <div className="flex flex-col md:flex-row items-start md:items-center mt-2 gap-4">
              <Input
                value={handle}
                onChange={(e) => {
                  console.log(e.target.value, "handlee")
                  setHandle(e.target.value)
                }}
                type="text"
                placeholder="Bot username"
                title="Bot Username"
                required={true}
                readonly={haveBot && !isEdit}
              />
              </div>
              <div className="w-full md:w-1/2">
              <Input
                value={botToken}
                onChange={(e) => {
                  console.log(e.target.value, "tokennn")
                  setBotToken(e.target.value)
                }}
                type="text"
                placeholder="Bot token"
                title="Bot Token"
                required={true}
                readonly={haveBot && !isEdit}
              />
              </div>
            {/* </div> */}
          {/* </div> */}
        </div>

        <div className="my-4" />
        {haveBot ? (
          isEdit ? (
            <div className="flex flex-col md:flex-row items-center gap-4 w-full md:justify-center">
              <div className="lg:max-w-[30%] md:max-w-[50%] max-w-[65%] w-full">
                <Button
                  size="large"
                  title="Cancel"
                  isLoading={false}
                  action={() => handleButtonAction("Cancel")}
                  isPrimary={false}
                />
              </div>

              <div className="lg:max-w-[30%] md:max-w-[50%] max-w-[65%] w-full">
                <Button
                  size="large"
                  title="Save"
                  isLoading={isLoading}
                  action={() => handleButtonAction("Save")}
                  isPrimary
                />
              </div>
            </div>
          ) : (
               <div className="flex flex-col md:flex-row items-center gap-4 w-full md:justify-center">
            <div className="lg:max-w-[30%] md:max-w-[50%] max-w-[65%] w-full">
              <Button
                size="large"
                title="Edit"
                isLoading={false}
                action={() => handleButtonAction("Edit")}
                isPrimary={true}
              />
            </div>
            <div className="lg:max-w-[30%] md:max-w-[50%] max-w-[65%] w-full">
              <Button
                size="large"
                title="Delete"
                isLoading={false}
                action={() => handleButtonAction("Delete")}
                isPrimary={false}
              />
            </div>
            </div>

          )
        ) : (
          <div className="flex flex-col md:flex-row items-center gap-4 w-full md:justify-center">
            <div className="lg:max-w-[30%] md:max-w-[50%] max-w-[65%] w-full">
              <Button
                size="large"
                title="Save"
                isLoading={false}
                action={() => handleButtonAction("Save")}
                isPrimary={true}
              />
            </div>
          </div>
        )}
        </div>
        
      <div className="my-12" >
        <div className="my-6" />
        <h5 className="text-align-left">Telegram Groups</h5>
        <div className="mb-8">

          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mx-4">

            <div className="flex items-center">
              <p className="text-sm text-white">https://t.me/</p>
              <span className="ml-2" />
            </div>

            <div className="w-full">
              <Input
                ref={groupInputRef}
                value={groupLink}
                onChange={(e) => setGroupLink(e.target.value)}
                type="text"
                placeholder="Group Name"
                title=""
                required={false}
              />
            </div>
          </div>
          <div className="mb-8" />

          <div className="flex flex-col mx-4">
            {/* <p className="text-sm text-white mb-2">
              Set the group as Gated or Open
            </p> */}

            <div className="flex items-center">
            <div className="flex flex-col md:flex-row items-start md:items-center mt-2 gap-4">
              <label htmlFor="checkbox1" className="flex items-start cursor-pointer">
                <input
                  id="checkbox1"
                  type="checkbox"
                  className="radio radio-secondary candidates-checkboxes"
                  checked={status === "open"}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setStatus("open");
                      return;
                    }
                  }}
                />
                <div className="ml-2">
                  <h4>Anyone</h4>
                  <p className="text-tiny">Anyone can join, no filtering</p>
                </div>
              </label>

              <div className="mx-4" />

              <label htmlFor="checkbox2" className="flex items-start md:items-center justify-start md:justify-center">
                <input
                  id="checkbox2"
                  type="checkbox"
                  className="radio radio-secondary candidates-checkboxes"
                  checked={status === "gated"}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setStatus("gated");
                      return;
                    }
                  }}
                />
                <div>
                  <h4 className="ml-1">Guest</h4>
                  <p className="text-tiny ml-1">Only verified Guest users</p>
                </div>
              </label>
              <div className="mx-4" />

              <label htmlFor="checkbox3" className="flex items-start md:items-center justify-start md:justify-center">
                <input
                  id="checkbox3"
                  type="checkbox"
                  className="radio radio-secondary candidates-checkboxes"
                  checked={status === "members"}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setStatus("members");
                      return;
                    }
                  }}
                />
                <div>
                  <h4 className="ml-1">Members</h4>
                  <p className="text-tiny ml-1">Only verifed Members</p>
                </div>
              </label>
            </div>
            </div>
          </div>
          <div className="lg:max-w-[30%] md:max-w-[50%] max-w-[65%] w-full">
            {editingGroupId ? (
              <div className="flex gap-4">
                <Button
                  size="large"
                  title="Save"
                  isLoading={false}
                  action={saveEditedGroup}
                  isPrimary
                />
                <Button
                  size="large"
                  title="Cancel"
                  isLoading={false}
                  action={cancelGroupEditFromTop}
                  isPrimary={false}
                />
              </div>
            ) : (
              <Button
                isLoading={false}
                size="large"
                title="Add Group"
                action={addGroupToArray}
                isPrimary={false}
              />
            )}
          </div>
        </div>

        {/* Display added groups array */}
        {groups.length > 0 && (
          <div className="mt-8 w-full">
            <p className="text-sm text-white mb-4">Added Groups ({groups.length}):</p>
            <div className="space-y-4">
              {groups.map((group, index) => (
                <div
                  key={group.id}
                  className="w-full flex justify-between items-start bg-[#03000733] rounded-lg py-4 px-6 backdrop-filter backdrop-blur-[8.6px] border border-[#FFFFFF1A]"
                >
                  <div className="flex flex-col flex-1">
                    <p className="text-sm text-white mb-2">Group {index + 1}</p>
                    {/* <p className="text-xs text-gray-300 mb-1">Bot: {group.handle}</p> */}
                    <p className="text-xs text-gray-300 mb-1">Link: https://t.me/{group.groupLink}</p>
                    <p className="text-xs text-gray-300 mb-1">Status: {group.status}</p>
                    {/* {group.instructions && (
                      <p className="text-xs text-gray-300">Instructions: {group.instructions}</p>
                    )} */}
                  </div>
                  <button
                    onClick={() => onEditGroup(group.id)}
                    className="flex items-center cursor-pointer ml-4 p-2 hover:bg-[#FFFFFF1A] rounded"
                  >
                    <EditIcon />
                    {/* <p className="text-sm text-white font-bold ml-1">Edit</p> */}
                  </button>
                  <button
                    onClick={() => removeGroupFromArray(group.id)}
                    className="flex items-center cursor-pointer ml-4 p-2 hover:bg-[#FFFFFF1A] rounded"
                  >
                    <RemoveIcon />
                    <p className="text-sm text-white font-bold ml-1">Delete</p>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="my-6" />

        <div className="lg:max-w-[30%] md:max-w-[50%] max-w-[65%] w-full flex flex-col justify-center items-center">
          <Button
            size="large"
            title="Save"
            isLoading={isLoading}
            action={addGroupTool}
            disabled={groups.length === 0}
            isPrimary
          />
        </div>
      </div>

      {/* {telegramConnections.map((conn, index) => (
        <div
          className="w-full flex justify-between items-center my-2 bg-[#03000733] rounded-lg py-8 px-12 backdrop-filter backdrop-blur-[8.6px]"
          key={`${conn.handle}-${index}`}
        >
          <div className="flex flex-col w-full">
            <div className="flex items-center self-end mb-2">
              <button className="border-white border-[1px] rounded-full p-2">
                <p className="text-white text-sm">Download Chat History</p>
              </button>

              <div
                className="flex items-center cursor-pointer ml-2"
                onClick={() => {
                  removeGroup(conn.handle);
                }}
              >
                <RemoveIcon />
                <p className="text-sm text-white font-bold ml-1">Delete</p>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <p className="text-sm text-white">
                  Need to be an admin in the group before you link it here
                </p>

                <p className="my-4 text-sm text-white">
                  https://t.me/{conn.handle}
                </p>
              </div>

              <div className="flex flex-col">
                <p className="text-sm text-white">Group's Privacy</p>

                <div className="flex items-center justify-center mt-4">
                  <input
                    id="checkbox3"
                    type="checkbox"
                    className="radio radio-secondary candidates-checkboxes"
                    defaultChecked
                  />
                  <p className="text-sm ml-1">
                    {conn.privacy === "open" ? "Open" : "Subscribers Only"}
                  </p>
                </div>
              </div>
            </div>
            <p className="text-sm text-white">{conn.instructions}</p>
          </div>
        </div>
      ))} */}
    </div>
  );
};

export default TelegramAgentOption;
