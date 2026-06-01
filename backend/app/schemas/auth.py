from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class AuthRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str | None = Field(default=None, min_length=8, max_length=128)
    full_name: str
    group_name: str | None = Field(default=None, max_length=50)


class StudentRegisterRequest(BaseModel):
    """Student registration with optional MTUCI LK integration"""
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str | None = Field(default=None, min_length=8, max_length=128)
    full_name: str = ""
    group_name: str | None = Field(default=None, max_length=50)
    mtuci_login: str | None = None
    mtuci_password: str | None = None


class AuthLoginRequest(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = False


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class MTUCIAuthData(BaseModel):
    """MTUCI LK credentials for auto-fill"""
    mtuci_login: str
    mtuci_password: str

