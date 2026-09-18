import Anthropic from "@anthropic-ai/sdk";
import { NOTICE } from "./notice.mjs";
import { SCHEMA, SYSTEM } from "./lib/extract-claude.ts";
const c = new Anthropic();
const content = [
  { type: "text", text: `Document text:\n\n${NOTICE}` },
  { type: "text", text: "Extract the fields you can read. Return null for anything absent." },
];
const base = { model:"claude-opus-5", max_tokens:8000, system:SYSTEM,
  messages:[{role:"user",content}], output_config:{ effort:"medium", format:{type:"json_schema",schema:SCHEMA} } };
async function go(label, p) {
  const t0=Date.now();
  try {
    const m = await c.messages.stream(p).finalMessage();
    const ms=Date.now()-t0;
    const json = m.content.find(b=>b.type==="text")?.text ?? "{}";
    const parsed = JSON.parse(json);
    console.log(`  ${label.padEnd(26)} ${(ms/1000).toFixed(1)}s  out=${String(m.usage.output_tokens).padStart(5)}  in=${m.usage.input_tokens}  cached=${m.usage.cache_read_input_tokens??0}  containers=${(parsed.containers??[]).length}/38 fields=${(parsed.fields??[]).length}`);
  } catch(e){ console.log(`  ${label.padEnd(26)} FAILED ${e.status}: ${(e.error?.error?.message??e.message).slice(0,70)}`); }
  await new Promise(r=>setTimeout(r,6000));
}
await go("adaptive (current)", { ...base, thinking:{type:"adaptive"} });
await go("thinking disabled",  { ...base, thinking:{type:"disabled"} });
await go("disabled + cached",  { ...base, thinking:{type:"disabled"}, cache_control:{type:"ephemeral"} });
