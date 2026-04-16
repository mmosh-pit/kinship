# MetaDAO App

Placeholder for the frontend. `src/client.ts` is a thin wrapper around the
generated Anchor client — you can import it from a Next.js or Vite project.

To scaffold a real frontend:

```bash
# from project root
npm create vite@latest app -- --template react-ts
# then move src/client.ts into the new app's src/lib/
```

The client expects `target/idl/metadao.json` and `target/types/metadao.ts`
to exist. Run `anchor build` at the project root first.
