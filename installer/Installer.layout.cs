// Included by configure-installer.mjs after all functional installer patches.
// Layout uses measured physical text dimensions rather than fixed 96-DPI boxes.
public partial class SetupForm {
 sealed class LayoutField {public Label Label;public TextBox Box;public Button Browse;}
 readonly List<LayoutField> layoutFields=new List<LayoutField>();
 Label layoutVersion,layoutSubtitle,layoutTerreLabel,layoutRecoveryNote,layoutFFmpegNote,layoutAiInfo;
 Button layoutLogs;Panel layoutAdvancedContent;
 bool responsiveReady,responsiveBusy;
 static int TextHeight(Control control,int width){return TextRenderer.MeasureText(control.Text,control.Font,new Size(Math.Max(1,width),int.MaxValue),TextFormatFlags.WordBreak|TextFormatFlags.TextBoxControl|TextFormatFlags.NoPrefix).Height+6;}
 static int TextWidth(Control control){return TextRenderer.MeasureText(control.Text,control.Font,new Size(int.MaxValue,int.MaxValue),TextFormatFlags.SingleLine|TextFormatFlags.NoPrefix).Width;}
 static float Density(Control control){return Math.Max(1f,TextRenderer.MeasureText("中文Ag",control.Font).Height/18f);}
 static int Pixels(float scale,int value){return (int)Math.Ceiling(value*scale);}
 static int PlaceText(Control control,int x,int y,int width){var label=control as Label;if(label!=null){label.AutoSize=false;label.UseMnemonic=false;}control.SetBounds(x,y,width,TextHeight(control,width));return control.Bottom;}
 static int PlaceCheck(CheckBox control,int x,int y,int width,float scale){control.AutoSize=false;control.UseMnemonic=false;int height=Math.Max(Pixels(scale,24),TextHeight(control,width-Pixels(scale,24)));control.SetBounds(x,y,width,height);return control.Bottom;}
 void InitializeResponsiveLayout(){
  // All DPI/font adaptation is explicit below, including dynamically created dialogs.
  AutoScaleMode=AutoScaleMode.None;
  layoutVersion=Controls.OfType<Label>().First(c=>c.Text.StartsWith("WebVideo+ 内部")||c.Text.StartsWith("WebVideo+ ")&&c.ForeColor==Color.FromArgb(150,75,20));
  layoutSubtitle=Controls.OfType<Label>().First(c=>c.Text.StartsWith("选择已有的 Terre"));
  layoutTerreLabel=Controls.OfType<Label>().First(c=>c.Text=="Terre 安装目录");
  layoutAiInfo=Controls.OfType<Label>().First(c=>c.AccessibleName=="生成式AI组件说明");
  layoutLogs=Controls.OfType<Button>().First(c=>c.Text=="打开日志");
  layoutRecoveryNote=advanced.Controls.OfType<Label>().First(c=>c.Text.StartsWith("关闭后仍会"));
  layoutFFmpegNote=advanced.Controls.OfType<Label>().First(c=>c.Text.StartsWith("选择含 ffmpeg.exe"));
  foreach(var item in new[]{Tuple.Create("游戏目录",games),Tuple.Create("成片保存目录",output),Tuple.Create("Terre 本机地址",url),Tuple.Create("WebVideo+ 数据目录",dataDir),Tuple.Create("导出工作缓存",workDir),Tuple.Create("安装缓存目录",installCache),Tuple.Create("FFmpeg 目录（可选）",ffmpegDir)}){
   var box=item.Item2;layoutFields.Add(new LayoutField{Label=advanced.Controls.OfType<Label>().First(c=>c.Text==item.Item1),Box=box,Browse=advanced.Controls.OfType<Button>().FirstOrDefault(c=>Math.Abs(c.Top-box.Top)<=2)});
  }
  var advancedChildren=advanced.Controls.Cast<Control>().ToArray();layoutAdvancedContent=new Panel();foreach(var child in advancedChildren)layoutAdvancedContent.Controls.Add(child);advanced.Controls.Add(layoutAdvancedContent);
  foreach(var label in new[]{headline,layoutVersion,layoutSubtitle,moduleNote,status,elapsed,layoutFFmpegNote,layoutRecoveryNote})label.TextChanged+=(s,e)=>ResponsiveLayout();
  foreach(var button in new[]{install,remove,cancel}){button.TextChanged+=(s,e)=>ResponsiveLayout();button.VisibleChanged+=(s,e)=>ResponsiveLayout();}
  FontChanged+=(s,e)=>ResponsiveLayout();ClientSizeChanged+=(s,e)=>ResponsiveLayout();
  advancedToggle.CheckedChanged+=(s,e)=>{advanced.Visible=advancedToggle.Checked;ResizeForContent();};
  Shown+=(s,e)=>ResizeForContent();responsiveReady=true;ResizeForContent();
 }
 void ResizeForContent(){if(!responsiveReady||responsiveBusy)return;float scale=Density(this);var area=Screen.FromControl(this).WorkingArea;MinimumSize=new Size(Math.Min(area.Width,Pixels(scale,560)),Math.Min(area.Height,Pixels(scale,430)));int width=Math.Min(area.Width-Pixels(scale,24),Math.Max(ClientSize.Width,Pixels(scale,760)));int height=Math.Min(area.Height-Pixels(scale,64),Pixels(scale,advancedToggle.Checked?900:560));ClientSize=new Size(Math.Max(320,width),Math.Max(300,height));ResponsiveLayout();if(!advancedToggle.Checked){ClientSize=new Size(ClientSize.Width,Math.Min(height,Math.Max(Pixels(scale,430),AutoScrollMinSize.Height)));ResponsiveLayout();}}
 void ResponsiveLayout(){if(!responsiveReady||responsiveBusy||IsDisposed)return;responsiveBusy=true;SuspendLayout();advanced.SuspendLayout();try{
  float scale=Density(this);int pad=Pixels(scale,24),gap=Pixels(scale,8),small=Pixels(scale,4),offset=AutoScrollPosition.Y;
  int width=Math.Max(200,ClientSize.Width-2*pad-SystemInformation.VerticalScrollBarWidth),y=pad+offset;
  y=PlaceText(headline,pad,y,width)+small;y=PlaceText(layoutVersion,pad,y,width)+gap;y=PlaceText(layoutSubtitle,pad,y,width)+gap;
  y=PlaceText(layoutTerreLabel,pad,y,width)+small;int row=Math.Max(terre.PreferredHeight,Pixels(scale,30));
  int findWidth=Math.Max(Pixels(scale,90),TextWidth(findTerre)+Pixels(scale,20)),selectWidth=Math.Max(Pixels(scale,82),TextWidth(selectTerre)+Pixels(scale,20));
  terre.SetBounds(pad,y,Math.Max(80,width-findWidth-selectWidth-2*gap),terre.PreferredHeight);findTerre.SetBounds(terre.Right+gap,y,findWidth,row);selectTerre.SetBounds(findTerre.Right+gap,y,selectWidth,row);y+=row+gap;
  y=PlaceCheck(advancedToggle,pad,y,width,scale)+gap;advanced.Visible=advancedToggle.Checked;
  if(advancedToggle.Checked){
   int scrollY=0,innerWidth=Math.Max(150,width-SystemInformation.VerticalScrollBarWidth-2*gap),ay=gap+scrollY;
   int columns=Math.Max(1,Math.Min(3,innerWidth/Pixels(scale,230))),columnWidth=(innerWidth-(columns-1)*gap)/columns;
   var boxes=ModuleCatalog.Advanced.Select(id=>moduleBoxes[id]).ToArray();
   for(int index=0;index<boxes.Length;index+=columns){int rowBottom=ay;for(int col=0;col<columns&&index+col<boxes.Length;col++)rowBottom=Math.Max(rowBottom,PlaceCheck(boxes[index+col],gap+col*(columnWidth+gap),ay,columnWidth,scale));ay=rowBottom+small;}
   ay=PlaceText(moduleNote,gap,ay+small,innerWidth)+gap;
   foreach(var field in layoutFields){ay=PlaceText(field.Label,gap,ay,innerWidth)+small;int buttonWidth=field.Browse==null?0:Math.Max(Pixels(scale,85),TextWidth(field.Browse)+Pixels(scale,20));int h=Math.Max(field.Box.PreferredHeight,Pixels(scale,30));field.Box.SetBounds(gap,ay,innerWidth-(buttonWidth==0?0:buttonWidth+gap),field.Box.PreferredHeight);if(field.Browse!=null)field.Browse.SetBounds(field.Box.Right+gap,ay,buttonWidth,h);ay+=h+gap;if(Object.ReferenceEquals(field.Box,ffmpegDir))ay=PlaceText(layoutFFmpegNote,gap+Pixels(scale,20),ay,innerWidth-Pixels(scale,20))+gap;}
   ay=PlaceCheck(keepRecovery,gap,ay,innerWidth,scale)+small;ay=PlaceText(layoutRecoveryNote,gap+Pixels(scale,20),ay,innerWidth-Pixels(scale,20))+gap;
   int natural=ay-scrollY;layoutAdvancedContent.Size=new Size(innerWidth+2*gap,natural);if(advanced.AutoScrollMinSize.Height!=natural)advanced.AutoScrollMinSize=new Size(0,natural);advanced.SetBounds(pad,y,width,Math.Min(natural,Math.Max(Pixels(scale,180),ClientSize.Height/2)));y=advanced.Bottom+gap;
  }
  int infoWidth=TextWidth(layoutAiInfo)+gap,aiWidth=Math.Min(width-infoWidth,TextWidth(aiModule)+Pixels(scale,28));y=PlaceCheck(aiModule,pad,y,aiWidth,scale)+small;layoutAiInfo.AutoSize=false;layoutAiInfo.SetBounds(aiModule.Right,aiModule.Top,infoWidth,Math.Max(aiModule.Height,TextHeight(layoutAiInfo,infoWidth)));layoutAiInfo.BringToFront();
  y=PlaceCheck(start,pad,y,width,scale)+gap;y=PlaceText(status,pad,y,width)+gap;progress.SetBounds(pad,y,width,Pixels(scale,9));y=progress.Bottom+small;y=PlaceText(elapsed,pad,y,width)+gap;
  int buttonHeight=Pixels(scale,34),bx=pad;foreach(var button in new[]{layoutLogs,remove,cancel,install}){if(!button.Visible)continue;int w=Math.Max(Pixels(scale,96),TextWidth(button)+Pixels(scale,28));if(bx>pad&&bx+w>pad+width){bx=pad;y+=buttonHeight+gap;}button.SetBounds(bx,y,w,buttonHeight);bx=button.Right+gap;}
  AutoScrollMinSize=new Size(0,y-offset+buttonHeight+pad);
 }finally{advanced.ResumeLayout(true);ResumeLayout(true);responsiveBusy=false;}}
 static void ConfigureUninstallLayout(Form dialog){
  dialog.AutoScaleMode=AutoScaleMode.None;dialog.AutoScroll=true;dialog.FormBorderStyle=FormBorderStyle.Sizable;
  var content=dialog.Controls.Cast<Control>().Where(c=>!(c is Button)).OrderBy(c=>c.Top).ToArray();var buttons=dialog.Controls.OfType<Button>().OrderBy(c=>c.Left).ToArray();bool layingOut=false;
  Action layout=()=>{if(layingOut||dialog.IsDisposed)return;layingOut=true;dialog.SuspendLayout();try{float scale=Density(dialog);int pad=Pixels(scale,24),gap=Pixels(scale,12),offset=dialog.AutoScrollPosition.Y,y=pad+offset,width=Math.Max(160,dialog.ClientSize.Width-2*pad-SystemInformation.VerticalScrollBarWidth);foreach(var c in content){var box=c as CheckBox;y=(box!=null?PlaceCheck(box,pad,y,width,scale):PlaceText(c,pad,y,width))+gap;}int bx=pad,h=Pixels(scale,34);foreach(var b in buttons){int w=Math.Max(Pixels(scale,100),TextWidth(b)+Pixels(scale,28));if(bx>pad&&bx+w>pad+width){bx=pad;y+=h+gap;}b.SetBounds(bx,y,w,h);bx=b.Right+gap;}dialog.AutoScrollMinSize=new Size(0,y-offset+h+pad);}finally{dialog.ResumeLayout(false);layingOut=false;}};
  dialog.ClientSizeChanged+=(s,e)=>layout();dialog.FontChanged+=(s,e)=>layout();
  float density=Density(dialog);var screen=Screen.FromControl(dialog).WorkingArea;dialog.MinimumSize=new Size(Math.Min(screen.Width,Pixels(density,400)),Math.Min(screen.Height,Pixels(density,300)));dialog.ClientSize=new Size(Math.Min(screen.Width-Pixels(density,32),Pixels(density,610)),Math.Min(screen.Height-Pixels(density,70),Pixels(density,560)));dialog.Shown+=(s,e)=>layout();layout();dialog.ClientSize=new Size(dialog.ClientSize.Width,Math.Min(screen.Height-Pixels(density,70),Math.Max(Pixels(density,300),dialog.AutoScrollMinSize.Height)));layout();
 }
}
