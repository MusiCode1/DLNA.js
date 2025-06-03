#Requires -Version 2.0

<#
.SYNOPSIS
    Sends a Wake-on-LAN (WoL) magic packet to the specified MAC address.
.DESCRIPTION
    The Send-WakeOnLan function constructs and sends a WoL magic packet
    to the broadcast address (255.255.255.255) on UDP port 9.
    This packet can wake up a computer that is configured for WoL.
.PARAMETER MacAddress
    The MAC address of the target computer.
    The address should be in a format like 'XX:XX:XX:XX:XX:XX' or 'XX-XX-XX-XX-XX-XX'.
.EXAMPLE
    Send-WakeOnLan -MacAddress "00:11:22:AA:BB:CC"
    This command sends a WoL packet to the computer with the MAC address 00:11:22:AA:BB:CC.
.EXAMPLE
    "00-11-22-AA-BB-CC" | Send-WakeOnLan
    This command pipes a MAC address string to the Send-WakeOnLan function.
.NOTES
    Author: Roo
    Last Modified: $(Get-Date)
    Ensure that the target computer's network adapter and BIOS/UEFI are configured to support Wake-on-LAN.
    The script sends the packet to the local network's broadcast address. For waking devices on different subnets,
    network configuration adjustments (like directed broadcasts or WoL gateways) might be necessary.
#>
function Send-WakeOnLan {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipeline = $true, HelpMessage = "Enter the MAC address of the target computer (e.g., 00:11:22:AA:BB:CC).")]
        [string]$MacAddress
    )

    try {
        # Remove common delimiters from MAC address and validate length
        $CleanMacAddress = $MacAddress -replace "[:-]"
        if ($CleanMacAddress.Length -ne 12) {
            throw "Invalid MAC address format. Expected 12 hexadecimal characters (e.g., 001122AABBCC)."
        }

        # Convert MAC address string to byte array
        $MacBytes = [byte[]]::new(6)
        for ($i = 0; $i -lt 6; $i++) {
            $MacBytes[$i] = [System.Convert]::ToByte($CleanMacAddress.Substring($i * 2, 2), 16)
        }

        # Construct the magic packet
        # It consists of 6 bytes of FF, followed by 16 repetitions of the target MAC address
        $Packet = [byte[]]::new(102)
        for ($i = 0; $i -lt 6; $i++) {
            $Packet[$i] = 0xFF
        }
        for ($i = 1; $i -le 16; $i++) {
            for ($j = 0; $j -lt 6; $j++) {
                $Packet[$i * 6 + $j] = $MacBytes[$j]
            }
        }

        # Create UDP client and send the packet
        $Client = New-Object System.Net.Sockets.UdpClient
        $Client.Connect(([System.Net.IPAddress]::Broadcast), 9) # Port 9 is standard for WoL
        [void]$Client.Send($Packet, $Packet.Length)
        $Client.Close()

        Write-Host "Wake-on-LAN magic packet sent to MAC address: $MacAddress"
    }
    catch {
        Write-Error "Failed to send Wake-on-LAN packet: $($_.Exception.Message)"
    }
}

<#
# Example Usage:
# Replace "XX:XX:XX:XX:XX:XX" with the actual MAC address of the target device.
# Ensure the target device is configured for Wake-on-LAN in its BIOS/UEFI and network adapter settings.

# Example 1: Direct call
# Send-WakeOnLan -MacAddress "00:11:22:AA:BB:CC"

# Example 2: Using pipeline
# "00-11-22-AA-BB-CC" | Send-WakeOnLan

# Example 3: Prompting for MAC address
# $TargetMac = Read-Host "Enter the MAC address of the device to wake"
# if ($TargetMac) {
#    Send-WakeOnLan -MacAddress $TargetMac
# } else {
#    Write-Warning "No MAC address entered."
# }
#
# Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
#
#>