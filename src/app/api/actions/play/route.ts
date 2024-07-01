/**
 * Solana Actions Example
 */

import {
  ActionPostResponse,
  ACTIONS_CORS_HEADERS,
  createPostResponse,
  ActionGetResponse,
  ActionPostRequest,
} from "@solana/actions";
import {
  clusterApiUrl,
  ComputeBudgetProgram,
  Connection,
  PublicKey as Web3JsPublicKey,
  Keypair as Web3JsKeypair,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  fromWeb3JsPublicKey,
  toWeb3JsKeypair,
  toWeb3JsLegacyTransaction,
  toWeb3JsPublicKey,
  toWeb3JsTransaction,
} from "@metaplex-foundation/umi-web3js-adapters"
import { createNoopSigner, createSignerFromKeypair, generateSigner, publicKey, PublicKey, sol, TransactionBuilder } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { AttributesPlugin, create, fetchAsset, fetchCollection, mplCore, update, updatePlugin } from "@metaplex-foundation/mpl-core";
import { dasApi } from "@metaplex-foundation/digital-asset-standard-api";
import { das } from "@metaplex-foundation/mpl-core-das";
import { mplToolbox, transferSol } from "@metaplex-foundation/mpl-toolbox";

const CHOICES = ["nuke", "foot", "cockroach"];

export const GET = async (req: Request) => {
  const payload: ActionGetResponse = {
    title: "Play Nuke Foot Cockroach",
    icon: new URL("/nuke-foot-cockroach.png", new URL(req.url).origin).toString(),
    description: "Mint an NFT to participate in this deadly twist on Rock Paper Scissors. If you win, you get to play again. If you lose, you die and the NFT is burned.",
    label: "Mint",
    links: {
      "actions": [
        {
          "label": "Nuke", // button text
          "href": "/api/actions/play?choice=nuke"
        },
        {
          "label": "Foot", // button text
          "href": "/api/actions/play?choice=foot"
        },
        {
          "label": "Cockroach", // button text
          "href": "/api/actions/play?choice=cockroach"
        }
      ],
    },
  };

  return Response.json(payload, {
    headers: ACTIONS_CORS_HEADERS,
  });
};

// DO NOT FORGET TO INCLUDE THE `OPTIONS` HTTP METHOD
// THIS WILL ENSURE CORS WORKS FOR BLINKS
export const OPTIONS = GET;

export const POST = async (req: Request) => {
  try {
    console.log(req);
    const requestUrl = new URL(req.url);
    const choice = requestUrl.searchParams.get("choice");

    const body: ActionPostRequest = await req.json();

    let account: PublicKey;
    try {
      account = fromWeb3JsPublicKey(new Web3JsPublicKey(body.account));
    } catch (err) {
      return new Response('Invalid "account" provided', {
        status: 400,
        headers: ACTIONS_CORS_HEADERS,
      });
    }

    const userSigner = createNoopSigner(account);

    const umi = createUmi(process.env.SOLANA_RPC! || clusterApiUrl("devnet")).use(mplCore()).use(dasApi()).use(mplToolbox());
    const kp = umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(JSON.parse(process.env.AUTH_KEY!)));
    const signer = createSignerFromKeypair(umi, kp);
    console.log(signer.publicKey);

    const assets = await das.getAssetsByOwner(umi, { owner: account });
    console.log(assets);

    let gameAsset: { publicKey: PublicKey, owner: PublicKey, attributes?: AttributesPlugin } | undefined = assets.find(asset => asset.updateAuthority.type === "Collection" &&
      asset.updateAuthority.address == publicKey("5GFo42AMrH5PdEge5DYQZN2ih98UK8iv4PYtGk6kCiHr") &&
      asset.name !== "Dead");

    let builder = new TransactionBuilder();
    builder = builder.add(transferSol(umi, {
      source: userSigner,
      destination: signer.publicKey,
      amount: sol(0.0001),
    }));
    let signers: Web3JsKeypair[] = [];

    if (gameAsset === undefined) {
      console.log("Creating new asset");
      const asset = generateSigner(umi);
      signers.push(toWeb3JsKeypair(asset));
      builder = builder.add(create(umi, {
        asset,
        collection: await fetchCollection(umi, publicKey("5GFo42AMrH5PdEge5DYQZN2ih98UK8iv4PYtGk6kCiHr")),
        payer: userSigner,
        authority: signer,
        owner: account,
        name: "Nuke Foot Cockroach",
        uri: "https://death.breadheads.io/nuke-foot-cockroach.json",
      }));

      gameAsset = { publicKey: asset.publicKey, owner: userSigner.publicKey, attributes: { authority: { type: "UpdateAuthority" }, attributeList: [{ key: "Wins", value: "0" }] } };
    }

    const cpuChoice = CHOICES[Math.floor(Math.random() * CHOICES.length)];

    // If the player wins, increment the wins counter.
    if ((choice === "nuke" && cpuChoice === "foot") ||
      (choice === "foot" && cpuChoice === "cockroach") ||
      (choice === "cockroach" && cpuChoice === "nuke")) {
      console.log("Wins");
      const wins = parseInt(gameAsset.attributes?.attributeList[0].value!);
      builder = builder.add(updatePlugin(umi, {
        asset: gameAsset.publicKey,
        collection: publicKey("5GFo42AMrH5PdEge5DYQZN2ih98UK8iv4PYtGk6kCiHr"),
        payer: userSigner,
        authority: signer,
        plugin: { type: "Attributes", attributeList: [{ key: "Wins", value: (wins + 1).toString() }] }
      }));
    }
    // If the player loses, update the Asset for death.
    else if ((choice === "foot" && cpuChoice === "nuke") ||
      (choice === "cockroach" && cpuChoice === "foot") ||
      (choice === "nuke" && cpuChoice === "cockroach")) {
      console.log("Dead");
      builder = builder.add(update(umi, {
        asset: gameAsset,
        collection: await fetchCollection(umi, publicKey("5GFo42AMrH5PdEge5DYQZN2ih98UK8iv4PYtGk6kCiHr")),
        payer: userSigner,
        authority: signer,
        name: "Dead",
        uri: "https://death.breadheads.io/ded.json",
      }));
    }

    console.log(builder.getInstructions());

    const tx = builder.setBlockhash(await umi.rpc.getLatestBlockhash()).setFeePayer(userSigner).build(umi);

    let transaction = toWeb3JsLegacyTransaction(tx);

    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        transaction,
        message: "Play Nuke Foot Cockroach",
      },
      signers,
    });

    return Response.json(payload, {
      headers: ACTIONS_CORS_HEADERS,
    });
  } catch (err) {
    console.log(err);
    let message = "An unknown error occurred";
    if (typeof err == "string") message = err;
    return new Response(message, {
      status: 400,
      headers: ACTIONS_CORS_HEADERS,
    });
  }
};
