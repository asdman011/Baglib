param([switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
try {
    $framework = [Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
    $metadata = Join-Path $env:SystemRoot 'System32\WinMetadata'
    $references = @('System.dll', 'System.Windows.Forms.dll', (Join-Path $framework 'System.Runtime.WindowsRuntime.dll'), (Join-Path $framework 'System.Runtime.dll'), (Join-Path $metadata 'Windows.ApplicationModel.winmd'), (Join-Path $metadata 'Windows.Foundation.winmd'), (Join-Path $metadata 'Windows.Storage.winmd'))
    $compiler = New-Object System.CodeDom.Compiler.CompilerParameters
    $compiler.GenerateInMemory = $true
    $compiler.ReferencedAssemblies.AddRange([string[]]$references)
    $compiler.ReferencedAssemblies.Add((Join-Path $framework 'System.Runtime.InteropServices.WindowsRuntime.dll')) | Out-Null
    Add-Type -CompilerParameters $compiler -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Windows.Forms;
using Windows.ApplicationModel.DataTransfer;

[ComImport, Guid("3A3DCD6C-3EAB-43DC-BCDE-45671CE800C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IShareInterop {
    IntPtr GetForWindow(IntPtr window, ref Guid iid);
    void ShowShareUIForWindow(IntPtr window);
}

public static class BaglibShare {
    [DllImport("user32.dll")]
    static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")]
    static extern bool SetForegroundWindow(IntPtr window);
    public static void Show(string text) {
        using (var host = new Form()) {
            host.ShowInTaskbar = false;
            host.Opacity = 0;
            host.Text = "Baglib";
            host.StartPosition = FormStartPosition.CenterScreen;
            host.Show();
            var window = host.Handle;
            ShowWindow(window, 5);
            SetForegroundWindow(window);
            var interop = (IShareInterop)WindowsRuntimeMarshal.GetActivationFactory(typeof(DataTransferManager));
            var iid = new Guid("a5caee9b-8708-49d1-8d36-67d25a8da00c");
            var pointer = interop.GetForWindow(window, ref iid);
            var manager = (DataTransferManager)Marshal.GetObjectForIUnknown(pointer);
            Marshal.Release(pointer);
            Windows.Foundation.TypedEventHandler<DataTransferManager, DataRequestedEventArgs> handler = (sender, args) => {
                args.Request.Data.Properties.Title = "Baglib";
                args.Request.Data.SetText(text);
                Console.WriteLine("READY");
                Console.Out.Flush();
            };
            manager.DataRequested += handler;
            using (var timer = new Timer()) {
                timer.Interval = 120000;
                timer.Tick += (sender, args) => Application.ExitThread();
                timer.Start();
                interop.ShowShareUIForWindow(window);
                Application.Run();
            }
            manager.DataRequested -= handler;
        }
    }
}
'@
    if ($ValidateOnly) { Write-Output 'COMPILED'; exit 0 }
    $payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
    [BaglibShare]::Show([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload.text)))
} catch {
    [Console]::Error.WriteLine($_.Exception.ToString())
    exit 1
}
