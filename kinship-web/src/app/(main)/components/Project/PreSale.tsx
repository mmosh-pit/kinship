import ChatBotIcon from "@/assets/icons/ChatBotIcon";
import axios from "axios";
import React from "react";

interface PresaleProps {
    onMenuChange: (type: string) => void;
    createMessage: (name: string, type: string) => void;
}

export const PreSale = (props: PresaleProps) => {
    const { onMenuChange, createMessage } = props;

    const [preSaleDiscount, setPreSaleDiscount] = React.useState(
        [
            {
                amount: "",
                discountPercentage: "",
                label: "1st"
            },
            {
                amount: "",
                discountPercentage: "",
                label: "2nd"
            },
            {
                amount: "",
                discountPercentage: "",
                label: "3rd"
            },
            {
                amount: "",
                discountPercentage: "",
                label: "4th"
            },
        ]
    );

    const [preSale, setPreSale] = React.useState([
        {
            label: "Pre-sale minimum",
            value: "",
            desc: "Minimum amount to raise or funds will be returned",
            key: "pre-sale-minimum",
        },
        {
            label: "Pre-sale maximum",
            value: "",
            desc: "Limit on what can be raised in pre-sale",
            key: "pre-sale-maximum",
        },
        {
            label: "Minimum purchase",
            value: "",
            desc: "What a single person needs to spend",
            key: "minimum-purchase",
        },
        {
            label: "Maximum purchase",
            value: "",
            desc: "What a single person can buy in presale",
            key: "maximum-purchase",
        },
    ]);

    const [preSaleStart, setPreSaleStart] = React.useState({
        date: "",
        time: "",
        timePeriod: "am"
    });

    const [preSalePeriod, setPreSalePeriod] = React.useState([
        {
            key: "month",
            value: ""
        },
        {
            key: "week",
            value: ""
        },
        {
            key: "day",
            value: ""
        },
        {
            key: "hour",
            value: ""
        },
        {
            key: "minute",
            value: ""
        },
    ]);
    React.useEffect(() => {
        const cachedData = localStorage.getItem("coinstep2");
        if (!cachedData) return;

        const parseData = JSON.parse(cachedData);
        console.log(parseData);

        // Update discounts
        const updatedDiscounts = preSaleDiscount.map((item, i) => ({
            ...item,
            amount: parseData.discount[i]?.value ?? item.amount,
            discountPercentage: parseData.discount[i]?.percentage ?? item.discountPercentage,
        }));

        // Update presale limits
        const updatedPresale = [...preSale];
        if (updatedPresale.length >= 4) {
            updatedPresale[0].value = parseData.presaleMinimum;
            updatedPresale[1].value = parseData.presaleMaximum;
            updatedPresale[2].value = parseData.purchaseMinimum;
            updatedPresale[3].value = parseData.purchaseMaximum;
        }

        setPreSaleStart(parseData.preSaleStart);
        setPreSalePeriod([
            { key: "month", value: parseData.preSalePeriod[0].value },
            { key: "week", value: parseData.preSalePeriod[1].value },
            { key: "day", value: parseData.preSalePeriod[2].value },
            { key: "hour", value: parseData.preSalePeriod[3].value },
            { key: "minute", value: parseData.preSalePeriod[4].value },
        ]);

        setPreSale(updatedPresale);
        setPreSaleDiscount(updatedDiscounts);
    }, []);


    const updatePreSaleDiscount = (value: string, index: number, type: string): void => {
        const discounts = [...preSaleDiscount];
        if (type === "amount") {
            discounts[index].amount = value.trim();
        } else {
            discounts[index].discountPercentage = value.trim();
        }
        setPreSaleDiscount(discounts);
    }

    const updatePreSalePrice = (event: React.ChangeEvent<HTMLInputElement>, item: any): void => {
        const updatedPrices = preSale.map((element) =>
            element.key === item.key
                ? { ...element, value: event.target.value }
                : element
        );
        setPreSale(updatedPrices);
    };

    const formatAmount = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
        }).format(amount);
    }

    const updatePrelookUp = (event: React.ChangeEvent<HTMLInputElement>, key: string): void => {
        const updatedValue = preSalePeriod.map((element) =>
            element.key === key
                ? { ...element, value: event.target.value.trim() }
                : element
        );
        setPreSalePeriod(updatedValue);
    };


    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value.replace(/\D/g, "");
        if (value.length >= 3 && value.length <= 4) {
            value = value.slice(0, 2) + "/" + value.slice(2);
        } else if (value.length >= 5 && value.length <= 8) {
            value = value.slice(0, 2) + "/" + value.slice(2, 4) + "/" + value.slice(4);
        }
        setPreSaleStart({ ...preSaleStart, date: value });
    };

    const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value.replace(/\D/g, "");

        if (value.length >= 3) {
            value = value.slice(0, 2) + ":" + value.slice(2);
        }

        setPreSaleStart({ ...preSaleStart, time: value });
    };

    const convertMonthsToMinutes = (monthsValue: number) => {
        const daysInMonth = 31;
        const hoursInDay = 24;
        const minutesInHour = 60;
        const calculatedMinutes = monthsValue * daysInMonth * hoursInDay * minutesInHour;
        console.log("===== MONTHS calculatedMinutes =====", calculatedMinutes);
        return calculatedMinutes;
    };
    const convertWeeksToMinutes = (weeksValue: number) => {
        const daysInWeek = 7;
        const hoursInDay = 24;
        const minutesInHour = 60;

        const calculatedMinutes = weeksValue * daysInWeek * hoursInDay * minutesInHour;
        console.log("===== WEEKS calculatedMinutes =====", calculatedMinutes);
        return calculatedMinutes;
    };

    const convertDaysToMinutes = (daysValue: number) => {
        const hoursInDay = 24;
        const minutesInHour = 60;
        const calculatedMinutes = daysValue * hoursInDay * minutesInHour;
        console.log("===== DAYS calculatedMinutes =====", calculatedMinutes);
        return calculatedMinutes;
    };
    const convertHoursToMinutes = (hoursValue: number) => {
        const calculatedMinutes = hoursValue * 60;
        console.log("===== HOURS calculatedMinutes =====", calculatedMinutes);
        return calculatedMinutes;
    };
    const convertMinutesToDate = (mins: number) => {
        const milliseconds = mins * 60000;
        const date = new Date(new Date().getTime() + milliseconds);
        console.log("===== TIMESTAMP =====", new Date().getTime());
        console.log("===== MILLI SECONDS =====", date.toUTCString());
        return date.toUTCString();
    };
    const convertMinutesToTimestamp = (minutes: number, startTime: number) => {
        const milliseconds = minutes * 60 * 1000;
        const futureTime = startTime + milliseconds;
        return futureTime;
    };
    const getPresaleStartTimestamp = (startDate: any, startTime: any) => {
        const day = Number(startDate[0]);
        const month = Number(startDate[1]) - 1;
        const year = Number(startDate[2]);

        let hour = Number(startTime[0]);
        const minute = Number(startTime[1]);

        if (preSaleStart.timePeriod.toLowerCase() === "pm" && hour < 12) {
            hour += 12;
        } else if (preSaleStart.timePeriod.toLowerCase() === "am" && hour === 12) {
            hour = 0;
        }

        return new Date(year, month, day, hour, minute).getTime();
    }




    const handleNextAction = async () => {
        const discount = preSaleDiscount.map(({ amount, discountPercentage }) => ({
            value: amount,
            percentage: discountPercentage,
        }));
        const values = {
            discounts: discount,
            presaleDetails: preSale,
            preSalePeriod,
            preSaleStart,
        };
        console.log("===== PRE SALE START =====", preSale);

        if (validate(values, true)) {
            // ----- lookup period -----
            const months = convertMonthsToMinutes(Number(preSalePeriod[0].value));
            const weeks = convertWeeksToMinutes(Number(preSalePeriod[1].value));
            const days = convertDaysToMinutes(Number(preSalePeriod[2].value));
            const hours = convertHoursToMinutes(Number(preSalePeriod[3].value));
            const minutes = Number(preSalePeriod[4].value);
            // const totalInMinutes = months + weeks + days + hours + minutes;

            // ----- presale start -----
            const startDate = preSaleStart.date.split("/");
            const startTime = preSaleStart.time.split(":");
            const totalInMinutes = convertMinutesToTimestamp(months + weeks + days + hours + minutes, getPresaleStartTimestamp(startDate, startTime));
            let fields = {
                presaleStartDate: getPresaleStartTimestamp(startDate, startTime),
                lockPeriod: totalInMinutes,
                discount: discount,
                presaleMinimum: preSale[0].value,
                presaleMaximum: preSale[1].value,
                purchaseMinimum: preSale[2].value,
                purchaseMaximum: preSale[3].value,
                totalSold: 0,
                preSaleStart: preSaleStart,
                preSalePeriod: preSalePeriod,
            }
            localStorage.setItem("coinstep2", JSON.stringify(fields));
            onMenuChange("launch")
        }
    }

    const getDaysInCurrentMonth = (year: number, month: number, date: Date): number => {
        const now = new Date();
        // new Date(year, month, 0).getDate();
        return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    };

    const validate = (values: any, isMessage: boolean): boolean => {
        const newErrors: Record<string, string> = {};
        // ---- Discounts Validation ----
        const discounts = values?.discounts || [];
        let totalDiscountPercentage = 0;
        let previousPercentage = Number(discounts[0]?.percentage || 0);

        for (let i = 0; i < discounts.length; i++) {
            const current = Number(discounts[i].percentage);
            totalDiscountPercentage += current;

            if (i > 0 && previousPercentage < current) {
                if (isMessage) {
                    createMessage("Discount percentage order should be higher to lower.", "danger-container");
                }
                return false;
            }
            previousPercentage = current;
        }

        // ---- Presale Details Validation ----
        for (const { key, value, label } of values.presaleDetails || []) {
            if (!/^\d*\.?\d+$/.test(value)) {
                createMessage(`Enter a valid ${label} value.`, "danger-container");
                return false;
            }
        }

        // ---- Pre-sale Period Validation ----
        const [month, week, day, hour, minute] = values.preSalePeriod || [];

        if (Number(month?.value) > 12) {
            createMessage("Invalid month", "danger-container");
            return false;
        } else if (Number(week?.value) > 4) {
            createMessage("Invalid week", "danger-container");
            return false;
        } else if (Number(day?.value) > getDaysInCurrentMonth(new Date().getFullYear(), new Date().getMonth(), new Date())) {
            createMessage("Invalid days", "danger-container");
            return false;
        } else if (Number(hour?.value) > 12) {
            createMessage("Invalid hour", "danger-container");
            return false;
        } else if (Number(minute?.value) > 59) {
            createMessage("Invalid minutes", "danger-container");
            return false;
        }

        // ---- Pre-sale start time Validation ----
        const { date, time, timePeriod } = values.preSaleStart;
        console.log("----- PRE SALE START -----", values.preSaleStart);

        const startTime = time.split(":");
        const startDate = date.split("/");
        if ((!startDate[2] || Number(startDate[2]) < new Date().getFullYear()) || (!startDate[1] || Number(startDate[1]) < new Date().getMonth() + 1) || (!startDate[0] || startDate[0] > getDaysInCurrentMonth(Number(startDate[2]), Number(startDate[1]), new Date()))) {
            createMessage("Invalid date.", "danger-container");
            return false;
        } else if (!time || Number(startTime[0]) > 12) {
            createMessage("Invalid hour.", "danger-container");
            return false;
        } else if (!startTime[1] || Number(startTime[1]) > 59) {
            createMessage("Invalid minutes.", "danger-container");
            return false;
        } else if (timePeriod !== "am" && timePeriod !== "pm") {
            createMessage("Invalid time format.", "danger-container");
            return false;
        }
        console.log("----- PRE SALE VALIDATION ERROR -----", newErrors);
        return Object.keys(newErrors).length === 0;
    };
    const goBack = () => {
        onMenuChange("minting")
    }


    return (
        <main className="relative py-5 px-5 xl:px-32 lg:px-16 md:px-8 bg-transparent">
            <div className="bg-[#09073A] p-6 max-w-6xl mx-auto text-white rounded-[12px] font-sans">
                <pre><h2 className="text-[13px] leading-[18px] font-extrabold tracking-tightest text-[#ECECEC] mb-4 font-avenirNext text-left ml-[196px]">Pre-sale Discount</h2></pre>
                <div className="w-full flex justify-center"></div>
                <div className="w-full flex justify-center">
                    <div className="w-[865px] h-[331px] grid grid-cols-[2.2fr_2.3fr_2.5fr] gap-x-4">
                        <div className="grid grid-cols-[auto_120px_1fr] items-start gap-x-2">
                            <span className="col-start-2 text-[#ECECEC] text-[10px] leading-[18px] tracking-tightest-0.7px font-avenir font-medium">
                                Up to this amount in sales.
                            </span>
                            <span className="col-start-3 text-[#ECECEC] text-[10px] leading-[18px] tracking-tightest-0.7px font-avenir font-medium text-right ">
                                Receives this discount.
                            </span>
                            {preSaleDiscount.map((discount, idx) => (
                                <React.Fragment key={idx}>
                                    <label className="text-xs text-white/90 py-2 text-right whitespace-nowrap">{discount.label} Tranche</label>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        className="w-[7.5rem] h-[2.5rem] rounded-[0.4375rem] border border-[#FFFFFF38] bg-black bg-opacity-[0.07] backdrop-blur-[1.21875rem] px-3 text-white text-[0.75rem] font-avenirNext focus:outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                        value={discount.amount}
                                        onChange={(event) => updatePreSaleDiscount(event.target.value.trim(), idx, "amount")}
                                    />
                                    <input
                                        type="text"
                                        value={discount.discountPercentage}
                                        onChange={(event) => updatePreSaleDiscount(event.target.value.trim(), idx, "percentage")}
                                        className="w-[55px] h-[40px] flex items-center justify-center bg-[#00000045] px-3 border border-none rounded-[8px] text-sm font-bold ml-[50px]"
                                    />

                                </React.Fragment>
                            ))}

                            <p className="col-start-2 col-span-2 text-[10px] text-white/40 mt-1 leading-tight">
                                How much percentage less than the launch price you can buy into the presale
                            </p>
                        </div>

                        <div className="flex flex-col items-center gap-4">
                            {preSale.map((item, i) => (
                                <div key={i} className="max-w-[157px]">
                                    <label className="block text-xs mb-1">{item.label}</label>
                                    <input
                                        type="text"
                                        value={item.value}
                                        placeholder="$ 0"
                                        className="w-[157px] h-[40px] rounded-[8px] border border-[#FFFFFF38] bg-black bg-opacity-[0.07] backdrop-blur-[19.5px] px-3 text-white text-sm font-avenirNext focus:outline-none"
                                        onChange={(event) => updatePreSalePrice(event, item)}
                                    />

                                    <p className="text-[10px] text-white/40 leading-tight text-wrap mt-[3px]">{item.desc}</p>
                                </div>
                            ))}
                        </div>
                        <div className="flex flex-col items-start gap-4">
                            <div className="flex flex-col w-full">
                                <label className="text-xs mb-1">Pre-sale lock-up period</label>
                                <div className="grid grid-cols-5 gap-2 w-full">
                                    {preSalePeriod.map((presaleDate, i) => (
                                        <div key={i} className="flex flex-col items-center gap-1">
                                            <span className="text-[10px] text-white/70 capitalize">{presaleDate.key}</span>
                                            <input
                                                type="number"
                                                min={0}
                                                placeholder="0"
                                                value={presaleDate.value}
                                                onChange={(event) => updatePrelookUp(event, presaleDate.key)}
                                                className="w-full h-[40px] bg-black bg-opacity-[0.07] border border-[#FFFFFF38] rounded-[8px] px-3 text-center text-sm appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            />

                                        </div>
                                    ))}
                                </div>
                                <div className="text-[10px] text-white/40 leading-tight mt-2">
                                    How long you have to wait after launch before you can sell. Maximum of 12 months, 4 weeks, 7 days, 24 hours and 60 minutes. For longer lockups, use the vesting feature
                                </div>
                            </div>

                            {/* bottom part = date/time */}
                            <div className="flex flex-col w-full">
                                <label className="text-xs mb-1 mt-2">Token pre-sale start date</label>
                                <div className="flex gap-2 items-center mb-1">
                                    <input
                                        type="text"
                                        placeholder="dd/mm/yyyy"
                                        value={preSaleStart.date}
                                        onChange={(event) => handleDateChange(event)}
                                        maxLength={10}
                                        className="w-[120px] h-[40px]  bg-black bg-opacity-[0.07] border border-[#FFFFFF38] rounded-[8px] px-2 text-sm"
                                        px-3
                                    />
                                    <input
                                        type="text"
                                        placeholder="hr:min"
                                        value={preSaleStart.time}
                                        onChange={(event) => handleTimeChange(event)}
                                        maxLength={5}
                                        className="w-[120px] h-[40px]  bg-black bg-opacity-[0.07] border border-[#FFFFFF38] rounded-[8px] px-2 text-sm"
                                    />

                                    <div className="flex items-center gap-2 ml-2">
                                        <label className="flex items-center gap-1 text-xs">
                                            <input
                                                type="radio"
                                                checked={preSaleStart.timePeriod === "am"}
                                                onChange={(event) => setPreSaleStart({ ...preSaleStart, timePeriod: event.target.value === "on" ? "am" : "pm" })}
                                                className="accent-[#E7007A] w-[14px] h-[14px]"
                                            />
                                            am
                                        </label>
                                        <label className="flex items-center gap-1 text-xs">
                                            <input
                                                type="radio"
                                                checked={preSaleStart.timePeriod === "pm"}
                                                onChange={(event) => setPreSaleStart({ ...preSaleStart, timePeriod: event.target.value === "on" ? "pm" : "am" })}
                                                className="accent-[#E7007A] w-[14px] h-[14px]"
                                            />
                                            pm
                                        </label>
                                    </div>
                                </div>
                                <div className="text-[10px] text-white/40 leading-tight">
                                    Has to be at least 24 hours before the launch date
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
                <div className="flex justify-center mt-20">
                    <button className="btn btn-link text-white no-underline" onClick={goBack}>Back</button>
                    <button className="btn btn-primary ml-10 bg-primary text-white border-none hover:bg-primary hover:text-white" onClick={handleNextAction}>
                        Next
                    </button>
                </div>
                <div className="flex justify-end mt-10 mr-5">
                    <button
                        className="w-[150px] h-[36px] rounded-[30px] text-[9px] flex items-center justify-center gap-2 bg-pink-500/20 backdrop-blur-[3px] text-white hover:bg-pink-500/30 transition"
                    >
                        Talk to Kip, the Kinship Bot
                        <ChatBotIcon />
                    </button>
                </div>
            </div>
        </main>
    );
}