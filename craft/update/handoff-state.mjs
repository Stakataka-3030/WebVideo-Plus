// This report never grants permission to remount or restore an old host. Only a
// future installer with an exact compatible hash may explicitly adopt the host.
export function shouldRetainUpdateLock(committed,observed){return committed===true&&!(observed?.state==='exited'&&Number.isInteger(observed.exitCode)||observed?.state==='not-started'&&observed.launchAttempted===false);}
export function classifyOfficialUpdate({version,supportedHosts,wrapperSha256,originalSha256},observed,hostSha256){
 const message='请先退出自动重启的 Craft，再从原来的快捷方式打开。增强功能不会自动恢复；关闭官方 Craft 后，用支持此版本的 WebVideo+ 安装器重新检查并挂载。';
 const common={version,hostSha256,automaticRemount:false,officialEntryPreserved:true,message};
 if(hostSha256===wrapperSha256&&observed?.state==='not-started'&&observed.launchAttempted===false)return {...common,state:'host-unchanged',message:'已确认官方安装器未启动，原入口未修改。请结束现有会话后再重试；可查看更新记录中的未启动原因。'};
 if(hostSha256===wrapperSha256&&!(observed?.state==='exited'&&Number.isInteger(observed.exitCode)))return {...common,state:'indeterminate',message:'无法确认官方安装是否仍在运行；原入口当前尚未变化。请等待并检查更新恢复记录，不要重复启动 Craft 或再次安装；没有写回旧文件。'};
 if(hostSha256===wrapperSha256)return {...common,state:observed?.state==='exited'&&observed.exitCode!==0?'installer-failed':'host-unchanged',message:'官方安装未替换原入口，增强版仍可从原快捷方式启动。请检查更新日志；如需恢复官方入口，请关闭 Craft 后用安装器卸载挂载。'};
 if(!hostSha256)return {...common,state:'indeterminate',officialEntryPreserved:false,message:'无法读取更新后的 Craft 入口。没有写回旧文件；请使用官方安装器修复 Craft，再检查增强适配。'};
 if(observed?.state!=='exited'||observed.exitCode!==0)return {...common,state:'host-changed-unverified'};
 if(hostSha256===originalSha256&&supportedHosts[version]!==hostSha256)return {...common,state:'host-changed-unverified'};
 return {...common,state:supportedHosts[version]===hostSha256?'official-compatible-unmounted':'official-unvalidated'};
}
