<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { fromStore } from 'svelte/store';
  import ConnectionModeSwitcher from '$components/ConnectionModeSwitcher.svelte';
  import ManualConnectionForm from '$components/ManualConnectionForm.svelte';
  import TvListConnectionForm from '$components/TvListConnectionForm.svelte';
  import PowerStatusIndicator from '$components/PowerStatusIndicator.svelte';
  import StatusBanner from '$components/StatusBanner.svelte';
  import ScreenshotPanel from '$components/ScreenshotPanel.svelte';
  import RemoteControls from '$components/RemoteControls.svelte';
  import NotificationHost from '$components/NotificationHost.svelte';
  import { connectionStore } from '$stores/connection';
  import { tvListStore, tvOptionsStore, findTvByName } from '$stores/tv-list';
  import { powerStateStore } from '$stores/power-state';
  import { screenshotService } from '$services/screenshot-service';
  import { remoteService } from '$services/remote-service';
  import { notificationStore } from '$stores/notifications';
  import { isValidIp, isValidMac, normalizeMac, type ConnectionMode } from '$utils/network';

  const connectionStoreValue = fromStore(connectionStore);
  const powerStateStoreValue = fromStore(powerStateStore);
  const screenshotStoreValue = fromStore(screenshotService);
  const tvOptionsStoreValue = fromStore(tvOptionsStore);
  const tvListStateValue = fromStore(tvListStore);

  const connectionState = $derived(connectionStoreValue.current);
  const powerState = $derived(powerStateStoreValue.current);
  const screenshotState = $derived(screenshotStoreValue.current);
  const tvOptions = $derived(tvOptionsStoreValue.current);
  const tvListState = $derived(tvListStateValue.current);

  const wakeDisabled = $derived(
    !isValidIp(connectionState.ipAddress) ||
      !isValidMac(connectionState.macAddress) ||
      powerState.isWakeInProgress ||
      powerState.isCheckInProgress
  );
  const showControls = $derived(connectionState.status === 'connected');
  const tvListError = $derived(
    tvListState.status === 'error' ? tvListState.error ?? 'שגיאה בטעינת רשימת הטלוויזיות' : undefined
  );

  let wasConnected: boolean | undefined;
  const unsubscribeConnection = connectionStore.subscribe(($connection) => {
    const connected = $connection.status === 'connected';
    if (wasConnected && !connected) {
      screenshotService.reset();
    }
    wasConnected = connected;
  });

  onDestroy(() => {
    unsubscribeConnection();
  });

  onMount(() => {
    if (!browser) return;
    tvListStore.load();
    if (isValidIp(connectionState.ipAddress) && isValidMac(connectionState.macAddress)) {
      powerStateStore.scheduleCheck(connectionState.ipAddress, connectionState.macAddress, 150);
    }
  });

  function handleModeChange(mode: ConnectionMode) {
    connectionStore.setConnectionMode(mode);
    if (mode === 'list') {
      const selected = findTvByName(connectionState.selectedTvName);
      if (selected) {
        connectionStore.selectTv(selected);
        powerStateStore.scheduleCheck(selected.ip, selected.macAddress ?? '', 150);
      }
    } else {
      powerStateStore.setStatus('unknown', 'מצב המסך לא ידוע');
    }
  }

  function handleManualIpInput(value: string) {
    connectionStore.updateManual({ ipAddress: value.trim() });
    powerStateStore.setStatus('unknown', 'מצב המסך לא ידוע');
  }

  function handleManualIpBlur(value: string) {
    const normalizedMac = normalizeMac(connectionState.macAddress ?? '');
    if (isValidIp(value.trim()) && isValidMac(normalizedMac)) {
      powerStateStore.scheduleCheck(value.trim(), normalizedMac, 0);
    }
  }

  function handleClientKeyInput(value: string) {
    connectionStore.updateManual({ clientKey: value });
  }

  function handleMacInput(value: string) {
    connectionStore.updateManual({ macAddress: value });
  }

  function handleMacBlur(value: string) {
    const normalized = normalizeMac(value);
    connectionStore.updateManual({ macAddress: normalized });
    if (isValidIp(connectionState.ipAddress) && isValidMac(normalized)) {
      powerStateStore.scheduleCheck(connectionState.ipAddress, normalized, 0);
    } else {
      powerStateStore.setStatus('unknown', 'מצב המסך לא ידוע');
    }
  }

  function handleSelectTv(name: string) {
    const tv = findTvByName(name);
    connectionStore.selectTv(tv ?? null);
    if (tv && tv.macAddress && isValidIp(tv.ip)) {
      powerStateStore.scheduleCheck(tv.ip, tv.macAddress, 150);
    }
  }

  async function connect() {
    try {
      await remoteService.connect(connectionState.ipAddress, connectionState.clientKey || undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'שגיאת התחברות';
      notificationStore.push('error', message);
    }
  }

  function disconnect() {
    remoteService.disconnect();
    screenshotService.reset();
  }

  async function wakeTv() {
    try {
      await powerStateStore.wake(connectionState.ipAddress, connectionState.macAddress);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notificationStore.push('error', message);
    }
  }

  function takeScreenshot() {
    screenshotService.captureOnce();
  }

  function toggleContinuous(enabled: boolean) {
    screenshotService.setContinuous(enabled);
  }

  function refreshPowerStatus() {
    powerStateStore.scheduleCheck(connectionState.ipAddress, connectionState.macAddress, 0);
  }
</script>

<NotificationHost />

<div class="container">
  <h1>שלט רחוק WebOS</h1>
  <div id="main-content-wrapper">
    <div id="left-column">
      <div class="card">
        <h2>התחברות</h2>
        <ConnectionModeSwitcher mode={connectionState.connectionMode} onchange={handleModeChange} />

        {#if connectionState.connectionMode === 'manual'}
          <ManualConnectionForm
            ipAddress={connectionState.ipAddress}
            clientKey={connectionState.clientKey}
            macAddress={connectionState.macAddress}
            onipInput={handleManualIpInput}
            onipBlur={handleManualIpBlur}
            onclientKeyInput={handleClientKeyInput}
            onmacInput={handleMacInput}
            onmacBlur={handleMacBlur}
          />
        {:else}
          <TvListConnectionForm
            options={tvOptions}
            selectedName={connectionState.selectedTvName}
            isLoading={tvListState.status === 'loading'}
            error={tvListError}
            onselect={handleSelectTv}
          />
        {/if}

        <button
          id="power-status-wrapper"
          type="button"
          class="power-status-refresh"
          style="margin: 10px 0;"
          onclick={refreshPowerStatus}
        >
          <PowerStatusIndicator status={powerState.status} message={powerState.message} />
        </button>

        <div class="input-group">
          <button id="wake-btn" type="button" disabled={wakeDisabled} onclick={wakeTv}>הפעל מסך (WoL)</button>
          <button id="connect-btn" disabled={connectionState.status === 'connected' || connectionState.status === 'connecting'} onclick={connect}>
            {connectionState.status === 'connecting' ? 'מתחבר...' : 'התחבר'}
          </button>
          <button id="disconnect-btn" type="button" disabled={connectionState.status !== 'connected'} onclick={disconnect}>התנתק</button>
        </div>

        <StatusBanner status={connectionState.status} message={connectionState.statusMessage} />
      </div>
    </div>

    {#if showControls}
      <div id="controls-screenshot-wrapper" style="gap: 20px;">
        <ScreenshotPanel
          screenshotUrl={screenshotState.url}
          isContinuous={screenshotState.isContinuous}
          isConnected={showControls}
          isLoading={screenshotState.isLoading}
          oncapture={takeScreenshot}
          ontoggle={toggleContinuous}
        />
        <RemoteControls isConnected={showControls} />
      </div>
    {/if}
  </div>
</div>
