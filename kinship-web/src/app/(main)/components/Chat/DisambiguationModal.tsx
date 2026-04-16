import React from 'react';
import { AmbiguousRecipient, DisambiguationResponse, SelectedRecipients } from '@/app/(main)/types/disambiguation';

interface DisambiguationModalProps {
  data: DisambiguationResponse;
  onSelect: (selected: SelectedRecipients) => void;
  onCancel: () => void;
}

const DisambiguationModal: React.FC<DisambiguationModalProps> = ({
  data,
  onSelect,
  onCancel,
}) => {
  // Store selected recipients as arrays for each ambiguous name
  const [selectedRecipients, setSelectedRecipients] = React.useState<{ [key: string]: AmbiguousRecipient[] }>({});

  const handleRecipientToggle = (name: string, recipient: AmbiguousRecipient) => {
    setSelectedRecipients(prev => {
      const current = prev[name] || [];
      const exists = current.some(r => r.wallet === recipient.wallet);
      return {
        ...prev,
        [name]: exists
          ? current.filter(r => r.wallet !== recipient.wallet)
          : [...current, recipient],
      };
    });
  };

  const handleConfirm = () => {
    // Require at least one selection per ambiguous name
    const allSelected = Object.keys(data.ambiguous).every(
      name => selectedRecipients[name] && selectedRecipients[name].length > 0
    );
    if (allSelected) {
      // Flatten to single array if needed, or pass as is
      onSelect(selectedRecipients);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#181747] rounded-lg p-6 max-w-2xl w-full mx-4">
        <h2 className="text-xl font-bold mb-4 text-white">Select Recipients</h2>
        {/* <p className="text-gray-300 mb-6">{data.instructions}</p> */}
        
        {Object.entries(data.ambiguous).map(([name, recipients]) => (
          <div key={name} className="mb-6">
            <h3 className="text-lg font-semibold mb-2 text-white">{name}</h3>
            <div className="space-y-2">
              {recipients.map((recipient) => {
                const checked = selectedRecipients[name]?.some(r => r.wallet === recipient.wallet) || false;
                return (
                  <label
                    key={recipient.wallet}
                    className={`flex items-center p-3 rounded cursor-pointer transition-colors ${
                      checked ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      name={name}
                      checked={checked}
                      onChange={() => handleRecipientToggle(name, recipient)}
                      className="mr-3"
                    />
                    <div>
                      <div className="text-white font-medium">
                        {recipient.display}
                      </div>
                      {recipient.username && (
                        <div className="text-gray-400 text-sm">
                          @{recipient.username}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex justify-end space-x-4 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded bg-gray-600 hover:bg-gray-500 text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!Object.keys(data.ambiguous).every(name => selectedRecipients[name] && selectedRecipients[name].length > 0)}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default DisambiguationModal;