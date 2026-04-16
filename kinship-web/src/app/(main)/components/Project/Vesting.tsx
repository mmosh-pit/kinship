export const Vesting = () => {
    return (
        <div className="min-h-screen bg-[#110A2B] text-white p-4 sm:p-8 flex items-center justify-center">
            <div className="w-full max-w-6xl mx-auto py-8 px-4 sm:px-6 bg-[#1A1137] rounded-lg shadow-lg">

                {/* Frankie's Tokenomics Header/Tab */}
                <div className="flex justify-center mb-8">
                    <button className="bg-gradient-to-r from-purple-600 to-pink-500 text-white font-semibold py-3 px-8 rounded-full shadow-lg hover:from-purple-700 hover:to-pink-600 transition duration-300">

                        Frankie's Tokenomics
                    </button>
                </div>

                <div className="flex flex-col lg:flex-row gap-8">

                    {/* Purchase Tokens Section */}
                    <div className="flex-1 border border-[#6B4BFF] p-6 rounded-lg">
                        <h3 className="text-xl font-semibold mb-6 text-purple-400">Purchase Tokens</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div>
                                <label htmlFor="amount" className="block text-sm font-medium text-gray-300 mb-1">Amount</label>
                                <input

                                    type="number"

                                    id="amount"

                                    placeholder="0.00"

                                    className="w-full p-3 bg-[#2A1F4D] border border-[#6B4BFF] rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"

                                />
                            </div>
                            <div>
                                <label htmlFor="usdtReceived" className="block text-sm font-medium text-gray-300 mb-1">USDT Received</label>
                                <input

                                    type="text"

                                    id="usdtReceived"

                                    placeholder="0.00 USDT"

                                    disabled

                                    className="w-full p-3 bg-[#2A1F4D] border border-[#6B4BFF] rounded-md text-gray-400 placeholder-gray-400 cursor-not-allowed"

                                />
                            </div>
                            <div>
                                <label htmlFor="tokenAmount" className="block text-sm font-medium text-gray-300 mb-1">Token Amount</label>
                                <input

                                    type="number"

                                    id="tokenAmount"

                                    placeholder="0.00 FNK"

                                    className="w-full p-3 bg-[#2A1F4D] border border-[#6B4BFF] rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"

                                />
                            </div>
                            <div>
                                <label htmlFor="usdtSpent" className="block text-sm font-medium text-gray-300 mb-1">USDT Spent</label>
                                <input

                                    type="text"

                                    id="usdtSpent"

                                    placeholder="0.00 USDT"

                                    disabled

                                    className="w-full p-3 bg-[#2A1F4D] border border-[#6B4BFF] rounded-md text-gray-400 placeholder-gray-400 cursor-not-allowed"

                                />
                            </div>
                        </div>

                        <div className="mb-6">
                            <label htmlFor="timeToUnlock" className="block text-sm font-medium text-gray-300 mb-1">Time to unlock</label>
                            <input

                                type="text"

                                id="timeToUnlock"

                                placeholder="2 Years"

                                disabled

                                className="w-full p-3 bg-[#2A1F4D] border border-[#6B4BFF] rounded-md text-gray-400 placeholder-gray-400 cursor-not-allowed"

                            />
                        </div>

                        <div className="mb-6">
                            <label htmlFor="referralAddress" className="block text-sm font-medium text-gray-300 mb-1">Referral Address</label>
                            <input

                                type="text"

                                id="referralAddress"

                                placeholder="0x..."

                                className="w-full p-3 bg-[#2A1F4D] border border-[#6B4BFF] rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"

                            />
                        </div>

                        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                            <p className="text-sm text-gray-300">Your Current Balance: <span className="font-semibold text-purple-300">0.00 FNK</span></p>
                            <button className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md transition duration-300 w-full sm:w-auto">

                                Buy Now
                            </button>
                        </div>

                        <div className="text-center text-sm text-gray-400">
                            <p className="mb-2">Max. Tokens: <span className="font-semibold text-white">1,000,000 FNK</span></p>
                            <p>Min. Tokens: <span className="font-semibold text-white">100 FNK</span></p>
                        </div>
                    </div>

                    <div className="flex-1 border border-[#6B4BFF] p-6 rounded-lg">
                        <h3 className="text-xl font-semibold mb-6 text-purple-400">Transactions</h3>
                        <div className="h-64 flex items-center justify-center text-gray-400 bg-[#2A1F4D] rounded-md mb-6">

                            No transactions yet.

                            {/* In a real app, this would be a table or list of transactions */}
                        </div>
                        <div className="flex justify-center">
                            <button className="bg-gradient-to-r from-purple-600 to-pink-500 text-white font-semibold py-3 px-8 rounded-full shadow-lg hover:from-purple-700 hover:to-pink-600 transition duration-300">

                                Get Your Referral Code
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex justify-center mt-10">
                    <button className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-8 rounded-md transition duration-300">

                        Claim Rewards
                    </button>
                </div>
            </div>
        </div>

    );
}