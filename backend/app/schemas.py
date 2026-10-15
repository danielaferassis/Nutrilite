from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, field_validator


class ItemCreate(BaseModel):
    name: str
    description: str | None = None


class ItemRead(ItemCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def assume_utc(cls, value: datetime) -> datetime:
        # O MySQL devolve a data sem fuso; marcamos como UTC para o frontend converter certo
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value
