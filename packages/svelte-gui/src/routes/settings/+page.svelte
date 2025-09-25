<script lang="ts">
	import { onMount } from 'svelte';
	import { Play, Pencil, Trash2, ChevronLeft } from 'svelte-lucide';
	import Modal from '$lib/components/Modal.svelte';
	import FileBrowser from '$lib/components/FileBrowser.svelte';
	import {
		getDevices,
		getPresets,
		savePreset,
		deletePreset,
		wakePreset,
		playPreset,
		type ApiDevice,
		type PresetEntry,
		type PresetSettings
	} from '$lib/api';

	let presets = $state<PresetEntry[]>([]);
	let devices = $state<ApiDevice[]>([]);
	let statusMessage = $state({ text: '', type: '' });

	// Form state
	let presetName = $state('');
	let rendererUdn = $state('');
	let rendererMac = $state('');
	let rendererBroadcast = $state('');
	let mediaServerUdn = $state('');
	let folderObjectId = $state('');

	let showFolderBrowser = $state(false);
	let selectedWolPreset = $state('');

	onMount(async () => {
		await loadData();
	});

	async function loadData() {
		try {
			devices = await getDevices();
			presets = await getPresets();
		} catch (e: any) {
			showStatus(e.message, 'error');
		}
	}

	function showStatus(text: string, type: 'success' | 'error') {
		statusMessage = { text, type };
		setTimeout(() => (statusMessage = { text: '', type: '' }), 5000);
	}

	const renderers = $derived(devices.filter((d) => d.serviceList?.['AVTransport']));
	const mediaServers = $derived(devices.filter((d) => d.serviceList?.['ContentDirectory']));

	function clearForm() {
		presetName = '';
		rendererUdn = '';
		rendererMac = '';
		rendererBroadcast = '';
		mediaServerUdn = '';
		folderObjectId = '';
	}

	function loadPresetForEditing(preset: PresetEntry) {
		presetName = preset.name;
		rendererUdn = preset.settings.renderer?.udn || '';
		rendererMac = preset.settings.renderer?.macAddress || '';
		rendererBroadcast = preset.settings.renderer?.broadcastAddress || '';
		mediaServerUdn = preset.settings.mediaServer?.udn || '';
		folderObjectId = preset.settings.mediaServer?.folder?.objectId || '';
	}

	async function handleSavePreset(event: Event) {
		event.preventDefault();
		if (!presetName || !rendererUdn || !rendererMac || !rendererBroadcast) {
			showStatus('Please fill all required fields.', 'error');
			return;
		}

		const broadcastRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
		if (!broadcastRegex.test(rendererBroadcast)) {
			showStatus('Invalid broadcast address format.', 'error');
			return;
		}

		const renderer = devices.find((d) => d.UDN === rendererUdn);
		const mediaServer = devices.find((d) => d.UDN === mediaServerUdn);

		const newPreset: PresetEntry = {
			name: presetName,
			settings: {
				renderer: {
					udn: rendererUdn,
					macAddress: rendererMac,
					broadcastAddress: rendererBroadcast,
					baseURL: renderer?.baseURL || '',
					ipAddress: renderer?.remoteAddress || ''
				},
				mediaServer: mediaServerUdn
					? {
							udn: mediaServerUdn,
							baseURL: mediaServer?.baseURL || '',
							folder: {
								objectId: folderObjectId
							}
						}
					: undefined
			}
		};

		try {
			const result = await savePreset(newPreset);
			showStatus(result.message || 'Preset saved!', 'success');
			clearForm();
			await loadData();
		} catch (e: any) {
			showStatus(e.message, 'error');
		}
	}

	async function handleDeletePreset(name: string) {
		if (!confirm(`Are you sure you want to delete preset "${name}"?`)) return;
		try {
			const result = await deletePreset(name);
			showStatus(result.message || 'Preset deleted!', 'success');
			await loadData();
		} catch (e: any) {
			showStatus(e.message, 'error');
		}
	}

	async function handlePlayPreset(name: string) {
		try {
			const result = await playPreset(name);
			showStatus(result.message || 'Play command sent!', 'success');
		} catch (e: any) {
			showStatus(e.message, 'error');
		}
	}

	async function handleWakePreset() {
		if (!selectedWolPreset) {
			showStatus('Please select a preset to wake.', 'error');
			return;
		}
		try {
			const result = await wakePreset(selectedWolPreset);
			showStatus(result.message || 'WOL command sent!', 'success');
		} catch (e: any) {
			showStatus(e.message, 'error');
		}
	}

	function handleFolderSelect(id: string) {
		folderObjectId = id;
		showFolderBrowser = false;
	}
</script>

<div class="space-y-8">

	{#if statusMessage.text}
		<div
			class="{statusMessage.type === 'success'
				? 'bg-green-900/50 text-green-300'
				: 'bg-red-900/50 text-red-300'} rounded-md p-4"
		>
			{statusMessage.text}
		</div>
	{/if}

	<!-- Preset Management -->
	<section class="rounded-lg bg-gray-800 p-6">
		<h2 class="mb-4 border-b border-gray-700 pb-2 text-xl font-bold">Manage Presets</h2>
		<form onsubmit={handleSavePreset} class="space-y-4">
			<div>
				<label for="preset-name" class="mb-1 block font-medium">Preset Name</label>
				<input
					type="text"
					id="preset-name"
					bind:value={presetName}
					class="w-full rounded-md border border-gray-600 bg-gray-700 p-2"
					placeholder="E.g., Living Room TV"
					required
				/>
			</div>
			<div>
				<label for="preset-renderer-udn" class="mb-1 block font-medium">Renderer</label>
				<select
					id="preset-renderer-udn"
					bind:value={rendererUdn}
					class="w-full rounded-md border border-gray-600 bg-gray-700 p-2"
					required
				>
					<option value="">Select a Renderer</option>
					{#each renderers as device (device.UDN)}
						<option value={device.UDN}>{device.friendlyName}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="preset-renderer-mac" class="mb-1 block font-medium">Renderer MAC Address</label>
				<input
					type="text"
					id="preset-renderer-mac"
					bind:value={rendererMac}
					class="w-full rounded-md border border-gray-600 bg-gray-700 p-2"
					placeholder="00:1A:2B:3C:4D:5E"
					required
					pattern="^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$"
				/>
			</div>
			<div>
				<label for="preset-renderer-broadcast" class="mb-1 block font-medium"
					>Broadcast Address</label
				>
				<input
					type="text"
					id="preset-renderer-broadcast"
					bind:value={rendererBroadcast}
					class="w-full rounded-md border border-gray-600 bg-gray-700 p-2"
					placeholder="E.g., 192.168.1.255"
					required
				/>
			</div>
			<div>
				<label for="preset-mediaserver-udn" class="mb-1 block font-medium"
					>Media Server (Optional)</label
				>
				<select
					id="preset-mediaserver-udn"
					bind:value={mediaServerUdn}
					class="w-full rounded-md border border-gray-600 bg-gray-700 p-2"
				>
					<option value="">Select a Media Server</option>
					{#each mediaServers as device (device.UDN)}
						<option value={device.UDN}>{device.friendlyName}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="preset-folder-object-id" class="mb-1 block font-medium"
					>Folder Object ID (Optional)</label
				>
				<div class="flex gap-2">
					<input
						type="text"
						id="preset-folder-object-id"
						bind:value={folderObjectId}
						class="w-full rounded-md border border-gray-600 bg-gray-700 p-2"
						placeholder="E.g., 0$1$2"
					/>
					<button
						type="button"
						onclick={() => (showFolderBrowser = true)}
						disabled={!mediaServerUdn}
						class="rounded-md bg-gray-600 px-4 py-2 font-bold text-white transition-colors hover:bg-gray-500 disabled:cursor-not-allowed disabled:bg-gray-700"
					>
						Browse...
					</button>
				</div>
			</div>
			<div class="flex gap-4">
				<button
					type="submit"
					class="rounded-md bg-blue-600 px-4 py-2 font-bold text-white transition-colors hover:bg-blue-500"
					>Save Preset</button
				>
				<button
					type="button"
					onclick={clearForm}
					class="rounded-md bg-gray-600 px-4 py-2 font-bold text-white transition-colors hover:bg-gray-500"
					>Clear Form</button
				>
			</div>
		</form>
	</section>

	<!-- Existing Presets -->
	<section class="rounded-lg bg-gray-800 p-6">
		<h2 class="mb-4 border-b border-gray-700 pb-2 text-xl font-bold">Existing Presets</h2>
		<ul class="space-y-4">
			{#each presets as preset (preset.name)}
				<li class="flex items-center justify-between rounded-md bg-gray-700 p-4 hover:bg-gray-600">
					<div class="mr-4 flex-grow overflow-hidden">
						<p class="truncate font-bold" title={preset.name}>{preset.name}</p>
						<div class="mt-2 space-y-1 text-xs text-gray-400">
							{#if preset.settings.renderer}
								<p class="truncate" title={preset.settings.renderer.udn}>
									<span class="font-semibold">Renderer:</span>
									{preset.settings.renderer.udn}
								</p>
								<p><span class="font-semibold">MAC:</span> {preset.settings.renderer.macAddress}</p>
								<p>
									<span class="font-semibold">Broadcast:</span>
									{preset.settings.renderer.broadcastAddress || 'N/A'}
								</p>
							{/if}
							{#if preset.settings.mediaServer}
								<p class="truncate" title={preset.settings.mediaServer.udn}>
									<span class="font-semibold">Media Server:</span>
									{preset.settings.mediaServer.udn}
								</p>
								{#if preset.settings.mediaServer.folder}
									<p class="truncate" title={preset.settings.mediaServer.folder.objectId}>
										<span class="font-semibold">Folder ID:</span>
										{preset.settings.mediaServer.folder.objectId}
									</p>
								{/if}
							{/if}
						</div>
					</div>
					<div class="flex gap-2">
						<button
							title="Play Preset"
							onclick={() => handlePlayPreset(preset.name)}
							class="rounded-md bg-green-600 p-2 text-sm font-bold text-white transition-colors hover:bg-green-500 cursor-pointer "
							><Play size="16" /></button
						>
						<button
							title="Edit Preset"
							onclick={() => loadPresetForEditing(preset)}
							class="rounded-md bg-yellow-600 p-2 text-sm font-bold text-white transition-colors hover:bg-yellow-500 cursor-pointer"
							><Pencil size="16" /></button
						>
						<button
							title="Delete Preset"
							onclick={() => handleDeletePreset(preset.name)}
							class="rounded-md bg-red-600 p-2 text-sm font-bold text-white transition-colors hover:bg-red-500 cursor-pointer"
							><Trash2 size="16" /></button
						>
					</div>
				</li>
			{:else}
				<p class="text-gray-400">No saved presets found.</p>
			{/each}
		</ul>
	</section>

	<!-- Wake on LAN -->
	<section class="rounded-lg bg-gray-800 p-6">
		<h2 class="mb-4 border-b border-gray-700 pb-2 text-xl font-bold">Wake on LAN</h2>
		<div class="flex items-end gap-4">
			<div class="flex-grow">
				<label for="wol-preset-select" class="mb-1 block font-medium">Select Preset to Wake</label>
				<select
					id="wol-preset-select"
					bind:value={selectedWolPreset}
					class="w-full rounded-md border border-gray-600 bg-gray-700 p-2"
				>
					<option value="">Select a Preset</option>
					{#each presets.filter((p) => p.settings.renderer?.macAddress) as preset (preset.name)}
						<option value={preset.name}>{preset.name}</option>
					{/each}
				</select>
			</div>
			<button
				onclick={handleWakePreset}
				class="rounded-md bg-green-600 px-4 py-2 font-bold text-white transition-colors hover:bg-green-500"
				>Send WOL</button
			>
		</div>
	</section>
</div>

{#if showFolderBrowser && mediaServerUdn}
	<Modal
		show={showFolderBrowser}
		onClose={() => (showFolderBrowser = false)}
		contentClass="w-[80vw] h-[80vh] bg-gray-900  p-2 flex flex-col"
	>
		{#snippet children()}
			<h2 class="text-xl font-bold mb-4 flex-shrink-0 text-gray-800">Select a Folder</h2>
			<div class="flex-grow overflow-hidden">
				<FileBrowser udn={mediaServerUdn} onFolderSelect={handleFolderSelect} />
			</div>
		{/snippet}
	</Modal>
{/if}
