import React from "react";
import { useAtom } from "jotai";

import EditIcon from "@/assets/icons/EditIcon";
import DeleteIcon from "@/assets/icons/DeleteIcon";
import CloseIcon from "@/assets/icons/CloseIcon";
import ArrowDown from "@/assets/icons/ArrowDown";
import ArrowUp from "@/assets/icons/ArrowUp";
import axios from "axios";
import Input from "../common/Input";
import Button from "../common/Button";
import Select from "../common/Select";
import internalClient from "@/app/(main)/lib/internalHttpClient";
import { selectedChatStore } from "@/app/(main)/store/chat";

interface CheckpointAttribute {
  id: string;
  label: string;
  type: string;
  required: boolean;
  instructions: string;
}

interface Checkpoint {
  id: string;
  name: string;
  tag: string;
  description: string;
  additionalInstructions: string;
  attributes: CheckpointAttribute[];
  prerequisites: string[];
}

const InstructAgent = ({ symbol }: { symbol: string }) => {
  const [selectedChat] = useAtom(selectedChatStore);
  const [isLoading, setIsLoading] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"instruct" | "checkpoints">("instruct");

  // Instruct tab states
  const [isOnEdit, setIsOnEdit] = React.useState(false);
  const [systemPrompt, setSystemPrompt] = React.useState("");

  // Checkpoints tab states
  const [checkpoints, setCheckpoints] = React.useState<Checkpoint[]>([]);
  const [showCheckpointForm, setShowCheckpointForm] = React.useState(false);
  const [expandedCheckpoint, setExpandedCheckpoint] = React.useState<string | null>(null);
  const [editingInlineCheckpoint, setEditingInlineCheckpoint] = React.useState<string | null>(null);
  const [checkpointsLoading, setCheckpointsLoading] = React.useState(false);

  // Checkpoint form states
  const [checkpointName, setCheckpointName] = React.useState("");
  const [checkpointTag, setCheckpointTag] = React.useState("");
  const [checkpointDescription, setCheckpointDescription] = React.useState("");
  const [checkpointInstructions, setCheckpointInstructions] = React.useState("");
  const [checkpointAttributes, setCheckpointAttributes] = React.useState<CheckpointAttribute[]>([]);
  const [checkpointPrerequisites, setCheckpointPrerequisites] = React.useState<string[]>([]);

  const [projectDetail, setProjectDetail] = React.useState<any>(null);

  const [showMsg, setShowMsg] = React.useState(false);
  const [msgClass, setMsgClass] = React.useState("");
  const [msgText, setMsgText] = React.useState("");

  const createMessage = React.useCallback((message: any, type: any) => {
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

  // Load checkpoints from API
  const loadCheckpoints = React.useCallback(async () => {
    if (!projectDetail?.project?.key) return;
    
    try {
      setCheckpointsLoading(true);
      const response = await internalClient.get(`/api/project/checkpoints?project=${projectDetail.project.key}&bot_id=${projectDetail.project.key}`);
      setCheckpoints(response.data.checkpoints || []);
    } catch (error) {
      console.error("Error loading checkpoints:", error);
      createMessage("Failed to load checkpoints", "danger-container");
    } finally {
      setCheckpointsLoading(false);
    }
  }, [projectDetail?.project?.key, createMessage]);

  const getProjectDetailFromAPI = React.useCallback(async () => {
    try {
      const listResult = await axios.get(
        `/api/project/detail?symbol=${symbol}`,
      );
      setProjectDetail(listResult.data);
      setSystemPrompt(listResult.data.project.system_prompt);
      // TODO: Load checkpoints from API
      // setCheckpoints(listResult.data.project.checkpoints || []);
    } catch (error) {
      console.log(error);
      setProjectDetail(null);
    }
  }, [symbol]);

  React.useEffect(() => {
    getProjectDetailFromAPI();
  }, [symbol]);

  // Load checkpoints when project details are loaded and checkpoints tab is active
  React.useEffect(() => {
    if (projectDetail && activeTab === "checkpoints") {
      loadCheckpoints();
    }
  }, [projectDetail, activeTab, loadCheckpoints]);

  // Checkpoint management helper functions
  const formatToSnakeCase = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  };

  const resetCheckpointForm = () => {
    setCheckpointName("");
    setCheckpointTag("");
    setCheckpointDescription("");
    setCheckpointInstructions("");
    setCheckpointAttributes([]);
    setCheckpointPrerequisites([]);
  };

  const openCheckpointForm = () => {
    resetCheckpointForm();
    setShowCheckpointForm(true);
  };

  const closeCheckpointForm = () => {
    setShowCheckpointForm(false);
    resetCheckpointForm();
  };

  const addAttribute = () => {
    const newAttribute: CheckpointAttribute = {
      id: Date.now().toString(),
      label: "",
      type: "string",
      required: false,
      instructions: "",
    };
    setCheckpointAttributes([...checkpointAttributes, newAttribute]);
  };

  const updateAttribute = (id: string, field: keyof CheckpointAttribute, value: any) => {
    setCheckpointAttributes(attributes =>
      attributes.map(attr =>
        attr.id === id ? { ...attr, [field]: value } : attr
      )
    );
  };

  const removeAttribute = (id: string) => {
    setCheckpointAttributes(attributes =>
      attributes.filter(attr => attr.id !== id)
    );
  };

  const getLabel = React.useCallback(() => {
    if (isOnEdit) return "Edit Core Instructions";
    return "Core Instructions";
  }, [isOnEdit]);

  const toggleInstructEdit = React.useCallback(async () => {
    setIsLoading(true);

    await internalClient.put("/api/project/update-system-prompt", {
      project: projectDetail.project.key,
      systemPrompt,
    });

    if (!isOnEdit) {
      createMessage("Core Instructions saved!", "success-container");
    } else {
      createMessage("Core Instructions updated!", "success-container");
    }

    setProjectDetail({
      ...projectDetail,
      project: {
        ...projectDetail.project,
        system_prompt: systemPrompt,
      },
    });

    setIsOnEdit(false);
    setIsLoading(false);
  }, [projectDetail, systemPrompt, isOnEdit]);

  // Open inline editing for a specific checkpoint
  const startInlineEdit = (checkpoint: Checkpoint) => {
    setEditingInlineCheckpoint(checkpoint.id);
    setCheckpointName(checkpoint.name);
    setCheckpointTag(checkpoint.tag);
    setCheckpointDescription(checkpoint.description);
    setCheckpointInstructions(checkpoint.additionalInstructions);
    setCheckpointAttributes(checkpoint.attributes);
    setCheckpointPrerequisites(checkpoint.prerequisites);
  };

  // Cancel inline editing
  const cancelInlineEdit = () => {
    setEditingInlineCheckpoint(null);
    resetCheckpointForm();
  };

  // Render a single checkpoint card with collapse/expand and inline edit functionality
  const renderCheckpointCard = (checkpoint: Checkpoint) => {
    const isExpanded = expandedCheckpoint === checkpoint.id;
    const isEditing = editingInlineCheckpoint === checkpoint.id;

    if (isEditing) {
      return (
        <div key={checkpoint.id} className="bg-black bg-opacity-20 backdrop-container p-6 rounded-lg shadow-lg border-l-4 border-[#CD068E]">
          <div className="space-y-6">
            {/* Edit Header */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg text-white font-goudy">Edit Checkpoint</h3>
              <button
                onClick={cancelInlineEdit}
                className="text-gray-400 hover:text-white p-1"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                type="text"
                title="Name"
                value={checkpointName}
                onChange={(e) => {
                  setCheckpointName(e.target.value);
                  setCheckpointTag(formatToSnakeCase(e.target.value));
                }}
                placeholder="e.g., Fitness Goals"
                required={true}
              />
              <Input
                type="text"
                title="Tag"
                value={checkpointTag}
                onChange={(e) => setCheckpointTag(formatToSnakeCase(e.target.value))}
                placeholder="e.g., fitness_goals"
                required={true}
                helperText="Auto-formatted to snake_case"
              />
            </div>

            <Input
              textarea
              type="text"
              title="Description"
              value={checkpointDescription}
              onChange={(e) => setCheckpointDescription(e.target.value)}
              placeholder="Brief description of this checkpoint"
              required={true}
            />

            <Input
              textarea
              type="text"
              title="Additional Instructions"
              value={checkpointInstructions}
              onChange={(e) => setCheckpointInstructions(e.target.value)}
              placeholder="Detailed instructions for this checkpoint"
              required={false}
            />

            {/* Attributes Section */}
            <div>
              <h4 className="text-lg text-white font-goudy mb-4">Attributes</h4>
              {checkpointAttributes.map((attribute) => (
                <div key={attribute.id} className="bg-black bg-opacity-20 p-4 rounded-lg mb-4 backdrop-container">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        type="text"
                        title="Label"
                        value={attribute.label}
                        onChange={(e) => updateAttribute(attribute.id, 'label', e.target.value)}
                        placeholder="Attribute name"
                        required={false}
                      />
                      <div className="flex flex-col">
                        <p className="text-xs text-white mb-2">Type</p>
                        <Select
                          value={attribute.type}
                          onChange={(e) => updateAttribute(attribute.id, 'type', e.target.value)}
                          options={[
                            { label: "String", value: "string" },
                            { label: "Number", value: "number" },
                            { label: "Boolean", value: "boolean" },
                            { label: "Date", value: "date" },
                          ]}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="text-white text-sm mr-3">Required</span>
                        <button
                          type="button"
                          onClick={() => updateAttribute(attribute.id, 'required', !attribute.required)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#CD068E] focus:ring-offset-2 ${
                            attribute.required ? 'bg-[#CD068E]' : 'bg-gray-600'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              attribute.required ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                      <button
                        onClick={() => removeAttribute(attribute.id)}
                        className="text-red-400 hover:text-red-300 flex items-center gap-1"
                      >
                        <DeleteIcon />
                        <span className="text-sm">Delete</span>
                      </button>
                    </div>
                    <Input
                      textarea
                      type="text"
                      title="Instructions"
                      value={attribute.instructions}
                      onChange={(e) => updateAttribute(attribute.id, 'instructions', e.target.value)}
                      placeholder="Instructions for this attribute"
                      required={false}
                    />
                  </div>
                </div>
              ))}
              <button
                onClick={addAttribute}
                className="w-full py-3 border border-[#FFFFFF40] rounded-md text-white text-sm hover:bg-[#FFFFFF10] transition-colors"
              >
                + Add more attributes
              </button>
            </div>

            {/* Prerequisites Section */}
            <div>
              <h4 className="text-lg text-white font-goudy mb-2">Prerequisites</h4>
              <p className="text-sm text-gray-400 mb-4">Select other checkpoints that must be completed first</p>
              {checkpoints.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {checkpoints
                    .filter(cp => cp.id !== editingInlineCheckpoint)
                    .map(cp => (
                      <button
                        key={cp.id}
                        onClick={() => {
                          if (checkpointPrerequisites.includes(cp.id)) {
                            setCheckpointPrerequisites(prev => prev.filter(id => id !== cp.id));
                          } else {
                            setCheckpointPrerequisites(prev => [...prev, cp.id]);
                          }
                        }}
                        className={`px-3 py-1 rounded-full text-sm transition-colors ${
                          checkpointPrerequisites.includes(cp.id)
                            ? 'bg-[#CD068E] text-white'
                            : 'bg-[#FFFFFF20] text-gray-300 hover:bg-[#FFFFFF30]'
                        }`}
                      >
                        {cp.name}
                      </button>
                    ))
                  }
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button
                title="Cancel"
                size="large"
                isPrimary={false}
                isLoading={false}
                action={() => {
                  setEditingInlineCheckpoint(null);
                  resetCheckpointForm();
                }}
              />
              <Button
                title="Update Checkpoint"
                size="large"
                isPrimary={true}
                isLoading={isLoading}
                action={() => updateCheckpoint(checkpoint.id)}
                disabled={!checkpointName.trim() || !checkpointTag.trim() || !checkpointDescription.trim()}
              />
            </div>
          </div>
        </div>
      );
    }

    // Regular display mode
    return (
      <div key={checkpoint.id} className="bg-black bg-opacity-20 backdrop-container rounded-lg shadow-lg">
        {/* Checkpoint Header - Always Visible */}
        <div className="p-6">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg text-white font-medium">{checkpoint.name}</h3>
                <span className="bg-[#FFFFFF20] px-3 py-1 rounded-full text-sm text-gray-300">
                  {checkpoint.tag}
                </span>
              </div>
              <p className="text-gray-400 text-sm mb-4">{checkpoint.description}</p>
              
              {/* Action Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={() => setExpandedCheckpoint(isExpanded ? null : checkpoint.id)}
                  className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
                >
                  {isExpanded ? <ArrowUp /> : <ArrowDown />}
                  <span>{isExpanded ? "Collapse" : "Expand"}</span>
                </button>
                <button
                  onClick={() => startInlineEdit(checkpoint)}
                  className="flex items-center gap-2 text-green-400 hover:text-green-300 text-sm"
                >
                  <EditIcon />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => deleteCheckpoint(checkpoint.id)}
                  className="flex items-center gap-2 text-red-400 hover:text-red-300 text-sm"
                >
                  <DeleteIcon />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="border-t border-[#FFFFFF20] p-6 space-y-6">
            {/* Additional Instructions */}
            {checkpoint.additionalInstructions && (
              <div>
                <h4 className="text-white text-base font-medium mb-3">Additional Instructions</h4>
                <div className="bg-[#FFFFFF10] p-4 rounded-lg">
                  <p className="text-gray-300 text-sm whitespace-pre-wrap">{checkpoint.additionalInstructions}</p>
                </div>
              </div>
            )}
            
            {/* Attributes */}
            {checkpoint.attributes.length > 0 && (
              <div>
                <h4 className="text-white text-base font-medium mb-3">Attributes</h4>
                <div className="space-y-3">
                  {checkpoint.attributes.map((attr) => (
                    <div key={attr.id} className="bg-[#FFFFFF10] p-4 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-white font-medium">{attr.label}</span>
                          <span className="bg-[#FFFFFF20] px-2 py-1 rounded text-xs text-gray-300">{attr.type}</span>
                          {attr.required && (
                            <span className="bg-[#CD068E] px-2 py-1 rounded text-xs text-white">Required</span>
                          )}
                        </div>
                      </div>
                      {attr.instructions && (
                        <p className="text-gray-400 text-sm">{attr.instructions}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prerequisites */}
            {checkpoint.prerequisites.length > 0 && (
              <div>
                <h4 className="text-white text-base font-medium mb-3">Prerequisites</h4>
                <div className="flex flex-wrap gap-2">
                  {checkpoint.prerequisites.map((prereqId) => {
                    const prereq = checkpoints.find(cp => cp.id === prereqId);
                    return prereq ? (
                      <span key={prereqId} className="bg-[#CD068E] px-3 py-1 rounded-full text-sm text-white">
                        {prereq.name}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const saveCheckpoint = async () => {
    if (!projectDetail?.project?.key) return;
    
    try {
      setIsLoading(true);
      
      const checkpointData = {
        name: checkpointName,
        tag: checkpointTag,
        description: checkpointDescription,
        additionalInstructions: checkpointInstructions,
        attributes: checkpointAttributes,
        prerequisites: checkpointPrerequisites,
      };

      const response = await internalClient.post('/api/project/checkpoints', {
        project: projectDetail.project.key,
        checkpoint: checkpointData,
        bot_id: projectDetail.project.key  // Use project key as bot_id
      });

      if (response.data.success) {
        setCheckpoints(checkpoints => [...checkpoints, response.data.checkpoint]);
        createMessage("Checkpoint created successfully!", "success-container");
        closeCheckpointForm();
      }
    } catch (error) {
      console.error("Error saving checkpoint:", error);
      createMessage("Failed to save checkpoint", "danger-container");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteCheckpoint = async (id: string) => {
    if (!projectDetail?.project?.key) return;
    
    try {
      setIsLoading(true);
      
      const response = await internalClient.delete(`/api/project/checkpoints?id=${id}&bot_id=${projectDetail.project.key}`);
      
      if (response.data.success) {
        setCheckpoints(checkpoints => checkpoints.filter(cp => cp.id !== id));
        createMessage("Checkpoint deleted successfully!", "success-container");
      }
    } catch (error) {
      console.error("Error deleting checkpoint:", error);
      createMessage("Failed to delete checkpoint", "danger-container");
    } finally {
      setIsLoading(false);
    }
  };

  const updateCheckpoint = async (id: string) => {
    if (!projectDetail?.project?.key) return;
    
    try {
      setIsLoading(true);
      
      const checkpointData = {
        name: checkpointName,
        tag: checkpointTag,
        description: checkpointDescription,
        additionalInstructions: checkpointInstructions,
        attributes: checkpointAttributes,
        prerequisites: checkpointPrerequisites,
      };

      const response = await internalClient.put('/api/project/checkpoints', {
        id,
        project: projectDetail.project.key,
        checkpoint: checkpointData,
        bot_id: projectDetail.project.key  // Use project key as bot_id
      });

      if (response.data.success) {
        setCheckpoints(checkpoints => 
          checkpoints.map(cp => cp.id === id ? response.data.checkpoint : cp)
        );
        createMessage("Checkpoint updated successfully!", "success-container");
        setEditingInlineCheckpoint(null);
        resetCheckpointForm();
      }
    } catch (error) {
      console.error("Error updating checkpoint:", error);
      createMessage("Failed to update checkpoint", "danger-container");
    } finally {
      setIsLoading(false);
    }
  };

  if (!projectDetail) return <></>;

  // Render inline checkpoint form
  const renderInlineCheckpointForm = () => (
    <div className="w-full bg-black bg-opacity-20 backdrop-container p-6 rounded-lg shadow-lg border border-[#FFFFFF20] mb-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl text-white font-goudy">Add New Checkpoint</h3>
        <button
          onClick={closeCheckpointForm}
          className="text-gray-400 hover:text-white p-1"
        >
          <CloseIcon />
        </button>
      </div>
      {renderCheckpointFormFields()}
    </div>
  );

  // Render the form fields (shared between modal and inline)
  const renderCheckpointFormFields = () => (
    <>
      <div className="space-y-6">
        {/* Name field */}
        <Input
          type="text"
          title="Name"
          value={checkpointName}
          onChange={(e) => {
            setCheckpointName(e.target.value);
            setCheckpointTag(formatToSnakeCase(e.target.value));
          }}
          placeholder="e.g., Fitness Goals"
          required={true}
        />

        {/* Tag field */}
        <Input
          type="text"
          title="Tag"
          value={checkpointTag}
          onChange={(e) => setCheckpointTag(formatToSnakeCase(e.target.value))}
          placeholder="e.g., fitness_goals"
          required={true}
          helperText="Auto-formatted to snake_case"
        />

        {/* Description field */}
        <Input
          textarea
          type="text"
          title="Description"
          value={checkpointDescription}
          onChange={(e) => setCheckpointDescription(e.target.value)}
          placeholder="Brief description of this checkpoint"
          required={true}
        />

        {/* Additional Instructions field */}
        <Input
          textarea
          type="text"
          title="Additional Instructions"
          value={checkpointInstructions}
          onChange={(e) => setCheckpointInstructions(e.target.value)}
          placeholder="Detailed instructions for this checkpoint"
          required={false}
        />

        {/* Attributes Section */}
        <div>
          <h4 className="text-lg text-white font-goudy mb-4">Attributes</h4>
          {checkpointAttributes.map((attribute) => (
            <div key={attribute.id} className="bg-black bg-opacity-20 p-4 rounded-lg mb-4 backdrop-container">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    type="text"
                    title="Label"
                    value={attribute.label}
                    onChange={(e) => updateAttribute(attribute.id, 'label', e.target.value)}
                    placeholder="Attribute name"
                    required={false}
                  />
                  <div className="flex flex-col">
                    <p className="text-xs text-white mb-2">Type</p>
                    <Select
                      value={attribute.type}
                      onChange={(e) => updateAttribute(attribute.id, 'type', e.target.value)}
                      options={[
                        { label: "String", value: "string" },
                        { label: "Number", value: "number" },
                        { label: "Boolean", value: "boolean" },
                        { label: "Date", value: "date" },
                      ]}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <span className="text-white text-sm mr-3">Required</span>
                    <button
                      type="button"
                      onClick={() => updateAttribute(attribute.id, 'required', !attribute.required)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#CD068E] focus:ring-offset-2 ${
                        attribute.required ? 'bg-[#CD068E]' : 'bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          attribute.required ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <button
                    onClick={() => removeAttribute(attribute.id)}
                    className="text-red-400 hover:text-red-300 flex items-center gap-1"
                  >
                    <DeleteIcon />
                    <span className="text-sm">Delete</span>
                  </button>
                </div>
                <Input
                  textarea
                  type="text"
                  title="Instructions"
                  value={attribute.instructions}
                  onChange={(e) => updateAttribute(attribute.id, 'instructions', e.target.value)}
                  placeholder="Instructions for this attribute"
                  required={false}
                />
              </div>
            </div>
          ))}
          <button
            onClick={addAttribute}
            className="w-full py-3 border border-[#FFFFFF40] rounded-md text-white text-sm hover:bg-[#FFFFFF10] transition-colors"
          >
            + Add more attributes
          </button>
        </div>

        {/* Prerequisites Section */}
        <div>
          <h4 className="text-lg text-white font-goudy mb-2">Prerequisites</h4>
          <p className="text-sm text-gray-400 mb-4">Select other checkpoints that must be completed first</p>
          {checkpoints.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {checkpoints
                .map(checkpoint => (
                  <button
                    key={checkpoint.id}
                    onClick={() => {
                      if (checkpointPrerequisites.includes(checkpoint.id)) {
                        setCheckpointPrerequisites(prev => prev.filter(id => id !== checkpoint.id));
                      } else {
                        setCheckpointPrerequisites(prev => [...prev, checkpoint.id]);
                      }
                    }}
                    className={`px-3 py-1 rounded-full text-sm transition-colors ${
                      checkpointPrerequisites.includes(checkpoint.id)
                        ? 'bg-[#CD068E] text-white'
                        : 'bg-[#FFFFFF20] text-gray-300 hover:bg-[#FFFFFF30]'
                    }`}
                  >
                    {checkpoint.name}
                  </button>
                ))
              }
            </div>
          )}
          {checkpoints.length === 0 && (
            <p className="text-gray-500 text-sm">No existing checkpoints available as prerequisites</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4 mt-8">
        <Button
          title="Cancel"
          size="large"
          isPrimary={false}
          isLoading={false}
          action={closeCheckpointForm}
        />
        <Button
          title="Save Checkpoint"
          size="large"
          isPrimary={true}
          isLoading={isLoading}
          action={saveCheckpoint}
          disabled={!checkpointName.trim() || !checkpointTag.trim() || !checkpointDescription.trim()}
        />
      </div>
    </>
  );

  return (
    <>
      {showMsg && (
        <div
          className={
            "message-container text-white text-center text-header-small-font-size py-5 px-3.5 " +
            msgClass
          }
        >
          {msgText}
        </div>
      )}
      
      <div className="background-content flex justify-center">
        <div className="flex flex-col mt-6 items-center w-[85%] md:w-[60%]">
          
          {/* Tab Navigation */}
          <div className="w-full flex mb-8">
            <button
              onClick={() => setActiveTab("instruct")}
              className={`flex-1 py-3 px-6 rounded-l-lg font-medium transition-colors ${
                activeTab === "instruct"
                  ? "bg-[#CD068E] text-white"
                  : "bg-[#FFFFFF20] text-gray-300 hover:bg-[#FFFFFF30]"
              }`}
            >
              Instruct
            </button>
            <button
              onClick={() => setActiveTab("checkpoints")}
              className={`flex-1 py-3 px-6 rounded-r-lg font-medium transition-colors ${
                activeTab === "checkpoints"
                  ? "bg-[#CD068E] text-white"
                  : "bg-[#FFFFFF20] text-gray-300 hover:bg-[#FFFFFF30]"
              }`}
            >
              Checkpoints
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === "instruct" && (
            <>
              <div className="w-full flex justify-between items-center py-4">
                <p className="text-base text-white">{getLabel()}</p>
                {projectDetail.project.system_prompt && (
                  <button
                    className="bg-[#42408442] rounded-full p-1"
                    onClick={() => setIsOnEdit(true)}
                  >
                    <EditIcon />
                  </button>
                )}
              </div>

              <div className="w-full bg-black bg-opacity-20 backdrop-container p-6 rounded-lg shadow-lg">
                <Input
                  textarea
                  type="text"
                  title=""
                  value={systemPrompt}
                  readonly={!isOnEdit && !!projectDetail.project.system_prompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  required={false}
                  placeholder="Enter the core instructions for your Agent"
                />
              </div>

              <div className="flex mt-12">
                {!projectDetail.project.system_prompt && systemPrompt !== "" && (
                  <Button
                    title="Save"
                    size="large"
                    isPrimary
                    isLoading={isLoading}
                    action={toggleInstructEdit}
                  />
                )}

                {projectDetail.project.system_prompt && isOnEdit && (
                  <>
                    <Button
                      title="Cancel"
                      size="large"
                      isPrimary={false}
                      isLoading={isLoading}
                      action={() => {
                        setIsOnEdit(false);
                        setSystemPrompt(projectDetail.project.system_prompt);
                      }}
                    />

                    <div className="mx-6" />

                    <Button
                      title="Save"
                      size="large"
                      isPrimary
                      isLoading={isLoading}
                      action={toggleInstructEdit}
                    />
                  </>
                )}
              </div>
            </>
          )}

          {activeTab === "checkpoints" && (
            <>
              {/* Add Checkpoint Button */}
              <div className="w-full mb-6">
                <button
                  onClick={openCheckpointForm}
                  disabled={checkpointsLoading}
                  className="w-full py-4 bg-[#CD068E] text-white font-medium rounded-lg hover:bg-[#CD068E]/90 transition-colors disabled:opacity-50"
                >
                  + Add Checkpoint
                </button>
              </div>

              {/* Loading State */}
              {checkpointsLoading && (
                <div className="w-full bg-black bg-opacity-20 backdrop-container p-8 rounded-lg shadow-lg text-center">
                  <p className="text-gray-400">Loading checkpoints...</p>
                </div>
              )}

              {/* Inline Checkpoint Form */}
              {showCheckpointForm && renderInlineCheckpointForm()}

              {/* Checkpoints List */}
              {!checkpointsLoading && checkpoints.length === 0 && !showCheckpointForm && (
                <div className="w-full bg-black bg-opacity-20 backdrop-container p-8 rounded-lg shadow-lg text-center">
                  <p className="text-gray-400 text-lg mb-2">No checkpoints yet.</p>
                  <p className="text-gray-500 text-sm">Add your first one to guide your agent.</p>
                </div>
              )}
              
              {!checkpointsLoading && checkpoints.length > 0 && (
                <div className="w-full space-y-4">
                  {checkpoints.map((checkpoint) => renderCheckpointCard(checkpoint))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default InstructAgent;