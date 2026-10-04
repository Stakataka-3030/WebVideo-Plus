param([Parameter(Mandatory=$true)][string]$MessageBase64)
$ErrorActionPreference='Stop'
# One bounded notification, not a resident tray process or a startup hook.
$message=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($MessageBase64))
if($message.Length -gt 6000){throw 'Update notification exceeds limit'}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form=New-Object Windows.Forms.Form
$form.Text='Craft 官方更新结果'
$form.StartPosition='CenterScreen';$form.ClientSize=New-Object Drawing.Size(620,250)
$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false;$form.MinimizeBox=$false
$text=New-Object Windows.Forms.TextBox
$text.Multiline=$true;$text.ReadOnly=$true;$text.ScrollBars='Vertical';$text.Text=$message
$text.SetBounds(16,16,588,184);$form.Controls.Add($text)
$close=New-Object Windows.Forms.Button
$close.Text='知道了';$close.SetBounds(494,210,110,28);$close.Add_Click({$form.Close()});$form.Controls.Add($close)
$timer=New-Object Windows.Forms.Timer
$timer.Interval=30000;$timer.Add_Tick({$form.Close()})
$form.Add_Shown({$timer.Start()})
try{[void]$form.ShowDialog()}finally{$timer.Stop();$timer.Dispose();$form.Dispose()}
