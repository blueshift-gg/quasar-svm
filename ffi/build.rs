fn main() {
    let crate_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();

    let bindings = cbindgen::Builder::new()
        .with_crate(&crate_dir)
        .with_language(cbindgen::Language::C)
        .with_include_guard("QUASAR_SVM_H")
        .with_no_includes()
        .with_sys_include("stdint.h")
        .with_sys_include("stdbool.h")
        .with_sys_include("stddef.h")
        .generate()
        .expect("Unable to generate C bindings");

    bindings.write_to_file(format!("{}/../include/quasar_svm.h", crate_dir));
    bindings.write_to_file(format!(
        "{}/../bindings/go/libquasar_svm_vendor/quasar_svm.h",
        crate_dir
    ));
}
