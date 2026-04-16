import { Connection } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

import { Connectivity as UserConn } from "@/anchor/user";
import { web3Consts } from "@/anchor/web3Consts";
import { pinImageToShadowDrive } from "../uploadImageToShdwDrive";
import { MintResultMessage } from "../../models/mintResultMessage";
import { CreateProfileParams } from "../../models/createProfileParams";
import { getTotalMints } from "../forge/getTotalMints";
import { getUsername } from "../forge/getUsername";
import { updateUserData } from "../forge/updateUserData";
import { updateTotalMints } from "../forge/updateTotalMints";
import { pinFileToShadowDrive } from "../uploadFileToShdwDrive";
import { uploadFile } from "@/app/(main)/lib/firebase";
import axios from "axios";

export const createProfile = async ({
  wallet,
  image,
  form,
  preview,
  parentProfile,
  banner,
  membership,
  membershipType,
  price,
  previousMembership,
  connection,
}: CreateProfileParams): Promise<MintResultMessage> => {
  try {
    const env = new anchor.AnchorProvider(connection.connection, wallet, {
      preflightCommitment: "processed",
    });
    const userConn: UserConn = new UserConn(env, web3Consts.programID);

    const seniority = (await getTotalMints()) + 1;
    let fullname = form.name;

    const body = {
      image: ""
    };

    if (image) {
      // const imageUri = await pinImageToShadowDrive(image);
      const date = new Date().getMilliseconds();
      const imageUri = await uploadFile(image, `${form.username}-banner-${date}`, "user-images");
      body.image = imageUri;
      if (imageUri === "") {
        return {
          message:
            "We’re sorry, there was an error while trying to uploading image. please try again later.",
          type: "error",
        };
      }
    } else {
      body.image = preview;
    }

    const res = await userConn.mintProfile({
      parentProfile,
      price,
      membership,
      connection
    });

    if (res.Ok) {
      const params = {
        username: form.username,
        symbol: form.username.substring(0, 10),
        bio: form.description,
        displayName: form.displayName,
        name: fullname,
        lastName: form.lastName,
        image: body.image,
        descriptor: form.descriptor,
        nouns: form.noun,
        link: form.link,
        seniority: seniority,
        banner,
      };


      await updateUserData(params);

      let date = new Date(); // Now
      if (membershipType === "monthly") {
        date.setDate(date.getDate() + 30);
      } else if (membershipType === "yearly") {
        date.setDate(date.getDate() + 365);
      }

      const notificationParams = {
        receiverAddress: wallet.publicKey.toBase58(),
        newMembership: membership,
        previousMembership: previousMembership
      }
      await axios.post("/api/notifications/send-membership-notification", notificationParams, {
        headers: {
          authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          'Content-Type': 'application/json',
        }
      });


      const membershipparams = {
        membership,
        membershiptype: membershipType,
        price,
        expirydate: date,
        wallet: wallet.publicKey.toString()
      };

      await axios.post("/api/membership/add", membershipparams, {
        headers: {
          authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          'Content-Type': 'application/json',
        }
      });
      const historyparams = {
        wallet: wallet.publicKey.toString(),
        membership,
        membershiptype: membershipType,
        price,
        expirydate: date,
      };
      axios.post("/api/membership/add-history", historyparams, {
        headers: {
          authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          'Content-Type': 'application/json',
        }
      }).then((result) => {
        console.log("ADD HISTORY RESULT", result);
      }).catch((error) => {
        console.log("ADD HISTORY RESPONSE", error);
      });

      await updateTotalMints(seniority);

      return {
        type: "success",
        message:
          "Congrats! Your profile has been minted, granting you full membership in MMOSH DAO.",
        data: params,
      };
    } else {
      console.log("Response: ", res);
      return {
        type: "error",
        message:
          "We’re sorry, there was an error while trying to mint your profile. Check your wallet and try again.",
      };
    }
  } catch (err) {
    console.error("Got error: ", err);
    return {
      type: "error",
      message: "Something wrong happened, please contact support",
    };
  }
};

export const buyMembership = async ({
  wallet,
  image,
  form,
  preview,
  parentProfile,
  membership,
  membershipType,
  price,
  previousMembership,
  connection,
}: CreateProfileParams): Promise<MintResultMessage> => {
  try {
    const env = new anchor.AnchorProvider(connection.connection, wallet, {
      preflightCommitment: "processed",
    });
    const userConn: UserConn = new UserConn(env, web3Consts.programID);
    const profileLineage = await getLineage(parentProfile.toBase58());
    if (profileLineage.parent === "") {
      return {
        type: "error",
        message:
          "We’re sorry, there was an error while trying to find parent profile.",
      };
    }
    const genesisProfile = web3Consts.genesisProfile;

    const res = await userConn.buyMembership({
      parentProfile,
      price,
      membership,
      connection
    });

    if (res.Ok) {
      let date = new Date(); // Now
      if (membershipType === "monthly") {
        date.setDate(date.getDate() + 30);
      } else if (membershipType === "yearly") {
        date.setDate(date.getDate() + 365);
      }
      const notificationParams = {
        receiverAddress: wallet.publicKey.toBase58(),
        newMembership: membership,
        previousMembership: previousMembership
      }
      await axios.post("/api/notifications/send-membership-notification", notificationParams, {
        headers: {
          authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          'Content-Type': 'application/json',
        }
      });


      const membershipparams = {
        membership,
        membershiptype: membershipType,
        price,
        expirydate: date,
        wallet: wallet.publicKey.toString()
      };

      await axios.post("/api/membership/update", membershipparams, {
        headers: {
          authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          'Content-Type': 'application/json',
        }
      });
      const historyparams = {
        wallet: wallet.publicKey.toString(),
        membership,
        membershiptype: membershipType,
        price,
        expirydate: date,
      };
       axios.post("/api/membership/add-history", historyparams, {
        headers: {
          authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          'Content-Type': 'application/json',
        }
      }).then((result) => {
        console.log("ADD HISTORY RESULT", result);
      }).catch((error) => {
        console.log("ADD HISTORY RESPONSE", error);
      });


      return {
        type: "success",
        message:
          "Congrats! Your profile has been minted, granting you full membership in MMOSH DAO.",
        data: {},
      };
    } else {
      console.log("Response: ", res);
      return {
        type: "error",
        message:
          "We’re sorry, there was an error while trying to mint your profile. Check your wallet and try again.",
      };
    }
  } catch (err) {
    console.error("Got error: ", err);
    return {
      type: "error",
      message: "Something wrong happened, please contact support",
    };
  }
};

export const trasferUsdCoin = async (wallet: any, receiver: string, amount: number) => {
  try {
    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_CLUSTER!, {
      confirmTransactionInitialTimeout: 120000,
    });
    const env = new anchor.AnchorProvider(connection, wallet, {
      preflightCommitment: "processed",
    });
    const userConn: UserConn = new UserConn(env, web3Consts.programID);
    const res = await userConn.trasferUsdCoin({
      recipient: { receiver, amount },
      sender: wallet.publicKey
    });
    console.log("===== RES =====", res);
    if (res.Ok) {
      return {
        type: "success",
        message: "Congrats! The amount has been transferred successfully.",
        data: res.Ok,
      };
    } else {
      return {
        type: "error",
        message: "We’re sorry, there was an error while trying to transfer USDC. Check your wallet and try again.",
      };
    }
  } catch (error) {
    console.log("===== TRASFER USDC ERROR =====", error);
    return {
      type: "error",
      message: "Something wrong happened, please contact support",
    };
  }
};

export const getLineage = async (profile: string) => {
  try {
    const res = await axios.get("/api/get-elders?profile=" + profile);
    return {
      gensis: process.env.NEXT_PUBLIC_GENESIS_PROFILE_HOLDER,
      parent: res.data.status ? res.data.result.promotor : process.env.NEXT_PUBLIC_GENESIS_PROFILE_HOLDER,
      gparent: res.data.status ? res.data.result.scout : process.env.NEXT_PUBLIC_GENESIS_PROFILE_HOLDER,
      ggparent: res.data.status ? res.data.result.recruitor : process.env.NEXT_PUBLIC_GENESIS_PROFILE_HOLDER,
      gggparent: res.data.status ? res.data.result.originator : process.env.NEXT_PUBLIC_GENESIS_PROFILE_HOLDER,
    }
  } catch (error) {
    return {
      gensis: process.env.NEXT_PUBLIC_GENESIS_PROFILE_HOLDER,
      parent: process.env.NEXT_PUBLIC_GENESIS_PROFILE_HOLDER,
      gparent: process.env.NEXT_PUBLIC_GENESIS_PROFILE_HOLDER,
      ggparent: process.env.NEXT_PUBLIC_GENESIS_PROFILE_HOLDER,
      gggparent: process.env.NEXT_PUBLIC_GENESIS_PROFILE_HOLDER,
    }
  }

}
