//go:build !windows

package main

// Non-Windows builds exist only for development and automated tests. The key file is
// readable by the current user only (0600) but is not encrypted; the scanner says so.

import "os/exec"

const keyProtection = "file-0600-unencrypted (development build)"

func protectKey(secret []byte) ([]byte, error) { return append([]byte(nil), secret...), nil }

func unprotectKey(blob []byte) ([]byte, error) { return append([]byte(nil), blob...), nil }

func hideWindow(*exec.Cmd) {}
