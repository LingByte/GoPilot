fn main() {
    tauri_build::build();
    
    // 在 macOS 上，修改 Info.plist 以支持文件拖放
    #[cfg(target_os = "macos")]
    {
        use std::path::PathBuf;
        use std::fs::File;
        use plist::Value;
        
        // 查找 Info.plist 文件
        let out_dir = std::env::var("OUT_DIR").unwrap();
        let info_plist_path = PathBuf::from(&out_dir)
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join("out")
            .join("Info.plist");
        
        if info_plist_path.exists() {
            if let Ok(mut file) = File::open(&info_plist_path) {
                if let Ok(mut plist) = plist::from_reader::<_, Value>(&mut file) {
                    // 检查是否已经包含 CFBundleDocumentTypes
                    if let Some(dict) = plist.as_dictionary_mut() {
                        if !dict.contains_key("CFBundleDocumentTypes") {
                            // 创建文件关联配置
                            let mut document_types = Vec::new();
                            
                            // 所有文件类型
                            let mut all_files = plist::Dictionary::new();
                            all_files.insert("CFBundleTypeName".to_string(), Value::String("All Files".to_string()));
                            all_files.insert("CFBundleTypeRole".to_string(), Value::String("Editor".to_string()));
                            all_files.insert("LSHandlerRank".to_string(), Value::String("Owner".to_string()));
                            
                            let mut content_types = Vec::new();
                            content_types.push(Value::String("public.data".to_string()));
                            content_types.push(Value::String("public.content".to_string()));
                            content_types.push(Value::String("public.item".to_string()));
                            content_types.push(Value::String("public.directory".to_string()));
                            all_files.insert("LSItemContentTypes".to_string(), Value::Array(content_types));
                            
                            document_types.push(Value::Dictionary(all_files));
                            
                            // 文件夹类型
                            let mut folder = plist::Dictionary::new();
                            folder.insert("CFBundleTypeName".to_string(), Value::String("Folder".to_string()));
                            folder.insert("CFBundleTypeRole".to_string(), Value::String("Editor".to_string()));
                            folder.insert("LSHandlerRank".to_string(), Value::String("Owner".to_string()));
                            
                            let mut folder_types = Vec::new();
                            folder_types.push(Value::String("public.folder".to_string()));
                            folder_types.push(Value::String("public.directory".to_string()));
                            folder.insert("LSItemContentTypes".to_string(), Value::Array(folder_types));
                            
                            document_types.push(Value::Dictionary(folder));
                            
                            // 添加到 plist
                            dict.insert("CFBundleDocumentTypes".to_string(), Value::Array(document_types));
                            
                            // 写回文件
                            if let Ok(mut out_file) = File::create(&info_plist_path) {
                                if let Err(e) = plist::to_writer_xml(&mut out_file, &plist) {
                                    eprintln!("警告: 无法写入 Info.plist: {}", e);
                                } else {
                                    println!("已添加文件关联配置到 Info.plist");
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
