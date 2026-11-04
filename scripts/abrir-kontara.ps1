<#
  Abre KONTARA 27 en esta PC con un doble clic (para un acceso directo del escritorio en Windows):
  inicia la base PostgreSQL local, aplica migraciones pendientes, rehace el build de producción si el
  código cambió, levanta la app y la abre en el navegador. Mientras esta ventana esté abierta la app
  sigue andando; al cerrarla se apaga la base de forma ordenada y se cierra todo lo que se inició acá.
  Registros en .data/lanzador.

  Uso manual: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/abrir-kontara.ps1
#>
$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "KONTARA 27"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz
$registros = Join-Path $raiz ".data\lanzador"
New-Item -ItemType Directory -Force $registros | Out-Null

# Procesos de la app en un Job Object de Windows: si esta ventana se cierra (o el lanzador muere), Windows
# termina todo lo que quedó. Antes, el aviso de cierre apaga PostgreSQL de forma ordenada con pg_ctl.
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;

public static class KontaraLanzador {
  [StructLayout(LayoutKind.Sequential)]
  struct BasicLimit {
    public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit; public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit;
    public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct IoCounters { public ulong R, W, O, RB, WB, OB; }
  [StructLayout(LayoutKind.Sequential)]
  struct ExtendedLimit {
    public BasicLimit Basic; public IoCounters Io; public UIntPtr ProcessMemoryLimit;
    public UIntPtr JobMemoryLimit; public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed;
  }
  delegate bool Manejador(uint tipo);

  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateJobObject(IntPtr atributos, IntPtr nombre);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int clase, ref ExtendedLimit info, uint largo);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr proceso);
  [DllImport("kernel32.dll")] static extern bool SetConsoleCtrlHandler(Manejador manejador, bool agregar);
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int cual);
  [DllImport("kernel32.dll")] static extern bool GetConsoleMode(IntPtr consola, out uint modo);
  [DllImport("kernel32.dll")] static extern bool SetConsoleMode(IntPtr consola, uint modo);

  static IntPtr trabajo;
  static Manejador manejador;
  static string pgCtl;
  static string datos;
  static bool pararBase;
  // Se guardan los objetos Process (no solo el número): mientras siguen abiertos, Windows no reutiliza el PID.
  static readonly List<Process> procesos = new List<Process>();

  public static string Preparar(string rutaPgCtl, string rutaDatos) {
    pgCtl = rutaPgCtl; datos = rutaDatos;
    manejador = Manejar;
    SetConsoleCtrlHandler(manejador, true);
    // Un clic en la ventana con «selección rápida» pausa el script: se desactiva solo para esta consola.
    uint modo;
    IntPtr entrada = GetStdHandle(-10);
    if (GetConsoleMode(entrada, out modo)) SetConsoleMode(entrada, (modo & ~0x40u) | 0x80u);
    trabajo = CreateJobObject(IntPtr.Zero, IntPtr.Zero);
    var info = new ExtendedLimit();
    info.Basic.LimitFlags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    if (trabajo == IntPtr.Zero || !SetInformationJobObject(trabajo, 9, ref info, (uint)Marshal.SizeOf(typeof(ExtendedLimit))))
      return "Job Object no disponible (error " + Marshal.GetLastWin32Error() + ")";
    return null;
  }

  public static string Vigilar(Process proceso) {
    lock (procesos) procesos.Add(proceso);
    if (trabajo != IntPtr.Zero && !AssignProcessToJobObject(trabajo, proceso.Handle))
      return "no se pudo agregar el proceso " + proceso.Id + " al Job Object (error " + Marshal.GetLastWin32Error() + ")";
    return null;
  }

  public static void PararBaseAlSalir(bool valor) { pararBase = valor; }

  // Cierre de ventana, fin de sesión o apagado: Windows da unos segundos antes de terminar el proceso.
  static bool Manejar(uint tipo) {
    if (tipo == 2 || tipo == 5 || tipo == 6) Apagar();
    return false;
  }

  public static void Apagar() {
    PararBase();
    List<Process> copia;
    lock (procesos) copia = new List<Process>(procesos);
    foreach (var p in copia) {
      try { if (!p.HasExited) Correr("taskkill.exe", "/PID " + p.Id + " /T /F", 2000); } catch { }
    }
  }

  static void PararBase() {
    if (!pararBase || pgCtl == null || !File.Exists(pgCtl)) return;
    pararBase = false;
    Correr(pgCtl, "stop -D \"" + datos + "\" -m fast -w -t 4", 4500);
  }

  static void Correr(string programa, string argumentos, int milisegundos) {
    try {
      var inicio = new ProcessStartInfo(programa, argumentos);
      inicio.UseShellExecute = false; inicio.CreateNoWindow = true;
      using (var p = Process.Start(inicio)) { p.WaitForExit(milisegundos); }
    } catch { }
  }
}
'@

function Leer-Variable([string]$nombre, [string]$porDefecto) {
  if (Test-Path ".env.local") {
    $linea = Get-Content ".env.local" | Where-Object { $_ -match "^\s*$nombre\s*=" } | Select-Object -First 1
    if ($linea) { return ($linea -replace "^\s*$nombre\s*=\s*", "").Trim().Trim('"').Trim("'") }
  }
  return $porDefecto
}

function Responde([string]$url) {
  try { return (Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 5).StatusCode -eq 200 } catch { return $false }
}

$node = (Get-Command node.exe).Source
$tsx = Join-Path $raiz "node_modules\tsx\dist\cli.mjs"

# Node directo (sin npm ni cmd.exe en el medio), en una consola oculta propia: al cerrar esta ventana el
# aviso de cierre le llega solo al lanzador, que apaga la base en orden; el Job Object termina el resto.
function Iniciar-Node([string[]]$argumentos, [string]$nombre) {
  $lista = $argumentos | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }
  $proceso = Start-Process $node -ArgumentList $lista -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $registros "$nombre.log") `
    -RedirectStandardError (Join-Path $registros "$nombre-errores.log")
  Anotar ([KontaraLanzador]::Vigilar($proceso))
  return $proceso
}

function Anotar([string]$aviso) {
  if ($aviso) { Add-Content -Path (Join-Path $registros "lanzador.log") -Value "$(Get-Date -Format s) $aviso" }
}

function Correr-Node([string]$descripcion, [string[]]$argumentos, [string]$nombre) {
  $proceso = Iniciar-Node $argumentos $nombre
  $proceso.WaitForExit()
  if ($proceso.ExitCode -ne 0) { throw "$descripcion falló. Detalle en .data\lanzador\$nombre-errores.log" }
}

function Esperar([scriptblock]$condicion, [int]$segundos, [string]$problema, $proceso, [string]$nombre) {
  $limite = (Get-Date).AddSeconds($segundos)
  while (-not (& $condicion)) {
    if (($proceso -and $proceso.HasExited) -or ((Get-Date) -gt $limite)) {
      if (& $condicion) { return }
      throw "$problema Detalle en .data\lanzador\$nombre.log y $nombre-errores.log"
    }
    Start-Sleep -Milliseconds 500
  }
}

$appUrl = (Leer-Variable "APP_URL" "http://localhost:3000").TrimEnd("/")
$salud = "$appUrl/api/health/ready"

if (Responde $salud) {
  Write-Host "KONTARA 27 ya estaba abierta: la muestro en el navegador."
  Start-Process $appUrl
  Start-Sleep -Seconds 3
  exit 0
}

Anotar ([KontaraLanzador]::Preparar(
  (Join-Path $raiz "node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe"),
  (Join-Path $raiz ".data\postgres")))

try {
  Write-Host "Iniciando la base de datos local..."
  $base = Iniciar-Node @($tsx, "scripts/db/local-postgres.ts") "base"
  $logBase = Join-Path $registros "base.log"
  Esperar { (Get-Content $logBase -Raw -ErrorAction SilentlyContinue) -match "listo|ya estaba corriendo" } 120 `
    "La base de datos no arrancó." $base "base"
  # Si la base ya estaba corriendo antes, la dejamos como estaba al salir.
  [KontaraLanzador]::PararBaseAlSalir(-not ((Get-Content $logBase -Raw -ErrorAction SilentlyContinue) -match "ya estaba corriendo"))

  Write-Host "Aplicando migraciones pendientes..."
  Correr-Node "La migración de la base" @($tsx, "scripts/db/migrate.ts") "migraciones"

  # El build se rehace solo cuando cambia el commit (por ejemplo, después de actualizar el código).
  $commit = $null
  try { $commit = (& git rev-parse HEAD 2>$null) } catch { $commit = $null }
  $marca = Join-Path $raiz ".next\kontara-commit"
  $buildAlDia = (Test-Path ".next\BUILD_ID") -and
    ((-not $commit) -or ((Test-Path $marca) -and ((Get-Content $marca -Raw).Trim() -eq $commit)))
  if (-not $buildAlDia) {
    Write-Host "Preparando la versión actual de la app (la primera vez tarda un par de minutos)..."
    Correr-Node "El build" @("node_modules\next\dist\bin\next", "build") "build"
    if ($commit) { Set-Content -Path $marca -Value $commit -Encoding ascii }
  }

  Write-Host "Iniciando KONTARA 27..."
  $app = Iniciar-Node @($tsx, "scripts/start-local-production.ts") "app"
  Esperar { Responde $salud } 120 "La app no arrancó." $app "app"

  Start-Process $appUrl
  $Host.UI.RawUI.WindowTitle = "KONTARA 27" # Next.js cambia el título de la ventana al arrancar
  Write-Host ""
  Write-Host "Listo: KONTARA 27 está abierta en $appUrl" -ForegroundColor Green
  Write-Host "Dejá esta ventana abierta mientras la usás. Para apagarla, cerrá esta ventana."
  $app.WaitForExit()
  throw "La app se detuvo."
}
catch {
  [KontaraLanzador]::Apagar()
  Write-Host ""
  Write-Host "KONTARA 27 no está funcionando: $($_.Exception.Message)" -ForegroundColor Red
  Read-Host "Apretá Enter para cerrar"
}
finally {
  # Base apagada en orden y procesos terminados; el Job Object cubre lo que quede si el lanzador muere.
  [KontaraLanzador]::Apagar()
}
