const baseCoins = [{
    name: "MMOSH: The Stoked Token",
    desc: "",
    image:
        "https://shdw-drive.genesysgo.net/7nPP797RprCMJaSXsyoTiFvMZVQ6y1dUgobvczdWGd35/MMoshCoin.png",
    token: process.env.NEXT_PUBLIC_OPOS_TOKEN!,
    symbol: "MMOSH",
    decimals: 9,
    is_memecoin: false
},
{
    name: "Wrapped SOL",
    desc: "",
    image:
        "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    token: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    decimals: 9,
    is_memecoin: false
},{
    name: "USD Coin",
    desc: "",
    image:
        "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
    token: process.env.NEXT_PUBLIC_USDC_TOKEN!,
    symbol: "USDC",
    decimals: 6,
    is_memecoin: false
}]

export default baseCoins