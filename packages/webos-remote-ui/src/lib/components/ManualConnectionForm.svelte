<script lang="ts">
  type Props = {
    ipAddress?: string;
    clientKey?: string;
    macAddress?: string;
    onipInput?: (value: string) => void;
    onipBlur?: (value: string) => void;
    onclientKeyInput?: (value: string) => void;
    onmacInput?: (value: string) => void;
    onmacBlur?: (value: string) => void;
  };

  const noop = () => {};

  let {
    ipAddress = '',
    clientKey = '',
    macAddress = '',
    onipInput = noop,
    onipBlur = noop,
    onclientKeyInput = noop,
    onmacInput = noop,
    onmacBlur = noop
  }: Props = $props();
</script>

<div class="connection-form" id="manual-connection">
  <div class="input-group">
    <input
      type="text"
      id="tv-ip"
      placeholder="הכנס כתובת IP של הטלוויזיה"
      value={ipAddress}
      oninput={(event) => onipInput((event.target as HTMLInputElement).value)}
      onchange={(event) => onipBlur((event.target as HTMLInputElement).value)}
    />
    <input
      type="text"
      id="client-key"
      placeholder="מפתח לקוח (אופציונלי)"
      value={clientKey}
      oninput={(event) => onclientKeyInput((event.target as HTMLInputElement).value)}
    />
    <input
      type="text"
      id="tv-mac"
      placeholder="כתובת MAC (ל-WoL)"
      value={macAddress}
      oninput={(event) => onmacInput((event.target as HTMLInputElement).value)}
      onchange={(event) => onmacBlur((event.target as HTMLInputElement).value)}
    />
  </div>
</div>
