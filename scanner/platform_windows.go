//go:build windows

package main

// Windows: the PC's private signing key is protected with DPAPI (CryptProtectData),
// so only the same Windows user on the same PC can unlock it. Pure syscalls, no cgo.

import (
	"errors"
	"os/exec"
	"syscall"
	"unsafe"
)

var (
	crypt32           = syscall.NewLazyDLL("crypt32.dll")
	kernel32          = syscall.NewLazyDLL("kernel32.dll")
	procProtectData   = crypt32.NewProc("CryptProtectData")
	procUnprotectData = crypt32.NewProc("CryptUnprotectData")
	procLocalFree     = kernel32.NewProc("LocalFree")
)

const (
	cryptprotectUIForbidden = 0x1
	keyProtection           = "windows-dpapi"
)

type dataBlob struct {
	cbData uint32
	pbData *byte
}

func newBlob(d []byte) *dataBlob {
	if len(d) == 0 {
		return &dataBlob{}
	}
	return &dataBlob{cbData: uint32(len(d)), pbData: &d[0]}
}

func (b *dataBlob) copyOut() []byte {
	out := make([]byte, b.cbData)
	copy(out, unsafe.Slice(b.pbData, b.cbData))
	return out
}

var dpapiEntropy = []byte("coinexa-network-scanner-v1")

func protectKey(secret []byte) ([]byte, error) {
	var out dataBlob
	r, _, err := procProtectData.Call(
		uintptr(unsafe.Pointer(newBlob(secret))), 0, uintptr(unsafe.Pointer(newBlob(dpapiEntropy))),
		0, 0, cryptprotectUIForbidden, uintptr(unsafe.Pointer(&out)))
	if r == 0 {
		return nil, errors.New("Windows could not protect the key: " + err.Error())
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(out.pbData)))
	return out.copyOut(), nil
}

func unprotectKey(blob []byte) ([]byte, error) {
	var out dataBlob
	r, _, err := procUnprotectData.Call(
		uintptr(unsafe.Pointer(newBlob(blob))), 0, uintptr(unsafe.Pointer(newBlob(dpapiEntropy))),
		0, 0, cryptprotectUIForbidden, uintptr(unsafe.Pointer(&out)))
	if r == 0 {
		return nil, errors.New("Windows could not unlock the key (was it linked under another Windows user?): " + err.Error())
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(out.pbData)))
	return out.copyOut(), nil
}

func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}
