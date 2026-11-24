# Control de audio de Windows para Jarvis: listar salidas, elegir la predeterminada, volumen.
# Uso: audio.ps1 -Accion listar | fijar -Valor <id> | volumen -Valor <0-100> | silencio -Valor <si|no>
param([string]$Accion = 'listar', [string]$Valor = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace JarvisAudio {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] internal class MMDeviceEnumerator { }
  [ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")] internal class PolicyConfigClient { }

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
  }

  [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IMMDeviceCollection {
    [PreserveSig] int GetCount(out int count);
    [PreserveSig] int Item(int index, out IMMDevice device);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    [PreserveSig] int OpenPropertyStore(int access, out IPropertyStore props);
    [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetState(out int state);
  }

  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IPropertyStore {
    [PreserveSig] int GetCount(out int count);
    [PreserveSig] int GetAt(int index, out PropertyKey key);
    [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant value);
    [PreserveSig] int SetValue(ref PropertyKey key, ref PropVariant value);
    [PreserveSig] int Commit();
  }

  [StructLayout(LayoutKind.Sequential)]
  internal struct PropertyKey { public Guid fmtid; public int pid; }

  [StructLayout(LayoutKind.Explicit, Size = 24)]
  internal struct PropVariant {
    [FieldOffset(0)] public ushort vt;
    [FieldOffset(8)] public IntPtr puntero;
  }

  // Interfaz no documentada de Windows; es la que usan todas las herramientas que cambian la salida predeterminada.
  [ComImport, Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IPolicyConfig {
    [PreserveSig] int GetMixFormat();
    [PreserveSig] int GetDeviceFormat();
    [PreserveSig] int ResetDeviceFormat();
    [PreserveSig] int SetDeviceFormat();
    [PreserveSig] int GetProcessingPeriod();
    [PreserveSig] int SetProcessingPeriod();
    [PreserveSig] int GetShareMode();
    [PreserveSig] int SetShareMode();
    [PreserveSig] int GetPropertyValue();
    [PreserveSig] int SetPropertyValue();
    [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int role);
    [PreserveSig] int SetEndpointVisibility();
  }

  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IAudioEndpointVolume {
    [PreserveSig] int RegisterControlChangeNotify(IntPtr notify);
    [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
    [PreserveSig] int GetChannelCount(out int count);
    [PreserveSig] int SetMasterVolumeLevel(float levelDb, ref Guid context);
    [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid context);
    [PreserveSig] int GetMasterVolumeLevel(out float levelDb);
    [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
    [PreserveSig] int SetChannelVolumeLevel(int channel, float levelDb, ref Guid context);
    [PreserveSig] int SetChannelVolumeLevelScalar(int channel, float level, ref Guid context);
    [PreserveSig] int GetChannelVolumeLevel(int channel, out float levelDb);
    [PreserveSig] int GetChannelVolumeLevelScalar(int channel, out float level);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }

  public static class Audio {
    [DllImport("ole32.dll")] private static extern int PropVariantClear(ref PropVariant pvar);

    private static void Comprobar(int hr, string que) {
      if (hr != 0) throw new Exception(que + " (0x" + hr.ToString("X8") + ")");
    }

    private static IMMDeviceEnumerator Enumerador() {
      return (IMMDeviceEnumerator)(new MMDeviceEnumerator());
    }

    private static string NombreDe(IMMDevice dispositivo) {
      IPropertyStore propiedades;
      if (dispositivo.OpenPropertyStore(0, out propiedades) != 0) return "";
      PropertyKey clave = new PropertyKey();
      clave.fmtid = new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"); // PKEY_Device_FriendlyName
      clave.pid = 14;
      PropVariant valor;
      if (propiedades.GetValue(ref clave, out valor) != 0) return "";
      string nombre = valor.vt == 31 ? Marshal.PtrToStringUni(valor.puntero) : "";
      PropVariantClear(ref valor);
      return nombre ?? "";
    }

    // Una linea por salida activa: id <TAB> nombre <TAB> 1 si es la predeterminada.
    public static string[] Listar() {
      IMMDeviceEnumerator enumerador = Enumerador();
      string idPredeterminado = "";
      IMMDevice predeterminado;
      if (enumerador.GetDefaultAudioEndpoint(0, 1, out predeterminado) == 0) predeterminado.GetId(out idPredeterminado);
      IMMDeviceCollection coleccion;
      Comprobar(enumerador.EnumAudioEndpoints(0, 1, out coleccion), "No pude listar las salidas de audio");
      int cantidad;
      coleccion.GetCount(out cantidad);
      List<string> lineas = new List<string>();
      for (int i = 0; i < cantidad; i++) {
        IMMDevice dispositivo;
        if (coleccion.Item(i, out dispositivo) != 0) continue;
        string id;
        dispositivo.GetId(out id);
        lineas.Add(id + "\t" + NombreDe(dispositivo) + "\t" + (id == idPredeterminado ? "1" : "0"));
      }
      return lineas.ToArray();
    }

    public static void Fijar(string id) {
      IPolicyConfig politica = (IPolicyConfig)(new PolicyConfigClient());
      for (int rol = 0; rol < 3; rol++) Comprobar(politica.SetDefaultEndpoint(id, rol), "No pude cambiar la salida de audio");
    }

    private static IAudioEndpointVolume VolumenPredeterminado() {
      IMMDevice dispositivo;
      Comprobar(Enumerador().GetDefaultAudioEndpoint(0, 1, out dispositivo), "No hay salida de audio predeterminada");
      Guid iid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
      object interfaz;
      Comprobar(dispositivo.Activate(ref iid, 23, IntPtr.Zero, out interfaz), "No pude acceder al volumen");
      return (IAudioEndpointVolume)interfaz;
    }

    public static void Volumen(int porcentaje) {
      Guid contexto = Guid.Empty;
      float nivel = Math.Max(0, Math.Min(100, porcentaje)) / 100f;
      Comprobar(VolumenPredeterminado().SetMasterVolumeLevelScalar(nivel, ref contexto), "No pude cambiar el volumen");
    }

    public static void Silencio(bool activar) {
      Guid contexto = Guid.Empty;
      Comprobar(VolumenPredeterminado().SetMute(activar, ref contexto), "No pude silenciar");
    }
  }
}
'@

switch ($Accion) {
  'listar' {
    $salidas = @()
    foreach ($linea in [JarvisAudio.Audio]::Listar()) {
      $p = $linea -split "`t"
      $salidas += [pscustomobject]@{ id = $p[0]; nombre = $p[1]; predeterminada = ($p[2] -eq '1') }
    }
    ConvertTo-Json -InputObject @($salidas) -Compress
  }
  'fijar' { [JarvisAudio.Audio]::Fijar($Valor); 'ok' }
  'volumen' { [JarvisAudio.Audio]::Volumen([int]$Valor); 'ok' }
  'silencio' { [JarvisAudio.Audio]::Silencio($Valor -eq 'si'); 'ok' }
  default { throw "Accion desconocida: $Accion" }
}
